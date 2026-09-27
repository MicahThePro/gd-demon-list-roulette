import { useEffect, useState } from 'react'
import Leaderboard from '../components/Leaderboard'
import ChangelogDialog from '../components/ChangelogDialog'
import { fetchAredlListBounds, fetchChallengeListBounds, fetchGslListBounds, fetchImpossibleLevelsBounds } from '../services/listService'
import { usePersistentPercentStep } from '../hooks/usePersistentPercentStep'
import { usePersistentListSource } from '../hooks/usePersistentListSource'
import { encodeHistory, MAX_PERCENT_STEP } from '../utils/roulette'

const CHALLENGE_LIST_SOURCE = 'challengelist'
const IMPOSSIBLE_LEVELS_SOURCE = 'impossiblelevels'
const SOURCE_LABELS = {
  pointercrate: 'Pointercrate',
  aredl: 'AREDL',
  gsl: 'GSL',
  [CHALLENGE_LIST_SOURCE]: 'Challenge List',
  [IMPOSSIBLE_LEVELS_SOURCE]: 'Impossible Levels List',
}
const RANKABLE_SOURCES = ['aredl', 'gsl', CHALLENGE_LIST_SOURCE, IMPOSSIBLE_LEVELS_SOURCE]
const DEFAULT_MAX = 150

const getBoundsForSource = (sourceName) => {
  if (sourceName === 'gsl') return fetchGslListBounds()
  if (sourceName === CHALLENGE_LIST_SOURCE) return fetchChallengeListBounds()
  if (sourceName === IMPOSSIBLE_LEVELS_SOURCE) return fetchImpossibleLevelsBounds()
  return fetchAredlListBounds()
}

export default function HomePage({ onStart, onLoadRun, savedRunCode, history }) {
  const [isLoading, setIsLoading] = useState(false)
  const [isBoardOpen, setIsBoardOpen] = useState(false)
  const [isChangelogOpen, setIsChangelogOpen] = useState(false)
  const [source, setSource] = usePersistentListSource()
  const [startRange, setStartRange] = useState('')
  const [endRange, setEndRange] = useState('')
  const [rangeMax, setRangeMax] = useState(DEFAULT_MAX)
  const [loadCode, setLoadCode] = useState(savedRunCode || '')
  const [loadError, setLoadError] = useState('')
  const [exportMessage, setExportMessage] = useState('')
  const [exportCode, setExportCode] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [percentStep, setPercentStep] = usePersistentPercentStep()
  const [percentStepDraft, setPercentStepDraft] = useState(() => String(percentStep))
  const estimatedRounds = Math.ceil(100 / percentStep)
  const isRankable = RANKABLE_SOURCES.includes(source)

  const clampValue = (value, minimum = 1, maximum = rangeMax) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) {
      return minimum
    }

    return Math.min(Math.max(Math.trunc(numeric), minimum), maximum)
  }

  const normalizeDraft = (value, minimum = 1, maximum = rangeMax) => {
    if (value === '') {
      return ''
    }

    const numeric = Number(value)
    if (!Number.isFinite(numeric)) {
      return ''
    }

    const cleaned = String(Math.trunc(numeric))
    if (Number(cleaned) < minimum) {
      return String(minimum)
    }
    if (Number(cleaned) > maximum) {
      return String(maximum)
    }
    return cleaned
  }

  useEffect(() => {
    setLoadCode(savedRunCode || '')
  }, [savedRunCode])

  useEffect(() => {
    if (!RANKABLE_SOURCES.includes(source)) {
      setRangeMax(DEFAULT_MAX)
      return undefined
    }

    let isActive = true

    const loadBounds = async () => {
      const bounds = await getBoundsForSource(source)
      if (!isActive) return
      const resolvedMax = Math.max(1, Number(bounds.end) || DEFAULT_MAX)
      setRangeMax(resolvedMax)
      // Always reset to the full range for the newly selected list. Clamping
      // the previous value would be wrong in one direction: going from a
      // longer list to a shorter one hides levels, and going from a shorter
      // list to a longer one would keep the old smaller end value.
      setStartRange('1')
      setEndRange(String(resolvedMax))
    }

    loadBounds().catch(() => {
      if (isActive) {
        setRangeMax(DEFAULT_MAX)
        setStartRange('1')
        setEndRange(String(DEFAULT_MAX))
      }
    })

    return () => {
      isActive = false
    }
  }, [source])

  const handleStartChange = (value) => {
    const nextStart = value === '' ? '' : normalizeDraft(value, 1, rangeMax)
    setStartRange(nextStart)

    if (nextStart !== '' && endRange !== '') {
      const numericStart = Number(nextStart)
      const numericEnd = Number(endRange)
      if (Number.isFinite(numericEnd) && numericStart > numericEnd) {
        setEndRange(String(numericStart))
      }
    }
  }

  const handleEndChange = (value) => {
    if (value === '') {
      setEndRange('')
      return
    }

    const minimum = Number(startRange || 1)
    const nextValue = normalizeDraft(value, 1, rangeMax)
    if (Number(nextValue) < minimum) {
      setEndRange(String(minimum))
      return
    }

    setEndRange(nextValue)
  }

  // The draft is free to be empty so the field can be cleared while typing;
  // the real value only commits on blur, falling back to 1.
  const handlePercentStepChange = (value) => {
    setPercentStepDraft(value)
  }

  const commitPercentStep = () => {
    const committed = setPercentStep(percentStepDraft)
    setPercentStepDraft(String(committed))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsLoading(true)
    try {
      const nextStart = isRankable ? clampValue(startRange || '1', 1, rangeMax) : undefined
      const nextEnd = isRankable ? clampValue(endRange || String(rangeMax), 1, rangeMax) : undefined

      if (isRankable && nextEnd < nextStart) {
        setEndRange(String(nextStart))
      }

      await onStart({
        source,
        start: nextStart,
        end: nextEnd,
        percentStep,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleLoad = () => {
    const trimmedCode = loadCode.trim()
    const success = onLoadRun?.(trimmedCode)

    if (!trimmedCode) {
      setLoadError('Paste a save code before loading your run.')
      return
    }

    if (!success) {
      setLoadError('That save code is invalid or expired.')
      return
    }

    setLoadError('')
  }

  // Exports the full leaderboard and copies it. The status line and the code
  // are separate states: overloading one for both meant a successful copy
  // replaced the code with its own message and left an empty box on screen.
  const handleExportHistory = async () => {
    const code = encodeHistory(history.entries)
    if (!code) {
      setExportCode('')
      setExportMessage('There is nothing to copy yet.')
      return
    }

    setExportCode(code)
    try {
      await navigator.clipboard?.writeText(code)
      setExportMessage('Copied. Paste it on the other device with Import leaderboard code.')
    } catch {
      setExportMessage('Copying was blocked, so the code is shown below. Select it and copy manually.')
    }
  }

  useEffect(() => {
    if (!exportMessage) return undefined

    const timeoutId = window.setTimeout(() => {
      setExportMessage('')
      setExportCode('')
    }, 15000)
    return () => window.clearTimeout(timeoutId)
  }, [exportMessage])

  return (
    <main className="page-shell home-page">
      {/* The leaderboard replaces the start form rather than overlaying it.
          A fixed overlay measured correctly in the DOM but did not reliably
          paint above the page, and a full-page view is simpler and matches the
          request for it to fill the screen. */}
      {isBoardOpen ? (
        <section className="panel board-page">
          <header className="board-page-bar">
            <div>
              <p className="eyebrow">Your runs</p>
              <h2>Leaderboard</h2>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setIsBoardOpen(false)}
            >
              Back
            </button>
          </header>

          <Leaderboard
            entries={history.entries}
            onDelete={history.deleteEntry}
            onClear={history.clearHistory}
            onExport={handleExportHistory}
            onImport={history.importEntries}
          />

          {exportMessage && (
            <div className="export-box">
              <p className="export-status">{exportMessage}</p>
              {exportCode && (
                <textarea
                  readOnly
                  rows="3"
                  value={exportCode}
                  aria-label="Exported leaderboard code"
                  onFocus={(event) => event.target.select()}
                />
              )}
            </div>
          )}
        </section>
      ) : (
      <section className="panel hero-panel">
        <header className="hero-copy">
          <p className="eyebrow">Geometry Dash Challenge</p>
          <h1>GD Demon List Roulette</h1>
          <p className="lead">
            Demon Roulette is a Geometry Dash challenge. You get a random level from a demon list and
            have to hit the target percentage on it. Clear it and the target goes up by your chosen step
            on a brand new random level. Miss it and the run is over. Starting at 1% and climbing in
            steps, the run ends the moment you clear a 100% level. Pick a bigger step in settings to
            make it harder, or limit it to a rank range for an even tougher draw.
          </p>
        </header>

        <div className="hero-columns">
          <div className="hero-column hero-column-main">
            <form className="setup-form" onSubmit={handleSubmit}>
          <div className="settings-row">
            <button
              type="button"
              className="secondary-button small-button"
              onClick={() => setIsSettingsOpen((open) => !open)}
              aria-expanded={isSettingsOpen}
            >
              {isSettingsOpen ? 'Hide settings' : 'Settings'}
            </button>
            <button
              type="button"
              className="secondary-button small-button"
              onClick={() => setIsBoardOpen((open) => !open)}
              aria-expanded={isBoardOpen}
            >
              {isBoardOpen ? 'Hide leaderboard' : 'Leaderboard'}
              {history.entries.length > 0 && (
                <span className="lb-badge">{history.entries.length}</span>
              )}
            </button>
            <button
              type="button"
              className="secondary-button small-button"
              onClick={() => setIsChangelogOpen(true)}
            >
              What's new
            </button>
            <span className="settings-summary">
              Step: +{percentStep}% ({estimatedRounds} levels to finish)
              {history.entries.length > 0 && ` · Best ${history.bestScore}%`}
            </span>
          </div>

          {isSettingsOpen && (
            <div className="settings-panel">
              <label>
                Percentage increment
                <input
                  type="number"
                  min="1"
                  max={MAX_PERCENT_STEP}
                  step="1"
                  value={percentStepDraft}
                  onChange={(event) => handlePercentStepChange(event.target.value)}
                  onBlur={commitPercentStep}
                  placeholder="1"
                />
              </label>
            </div>
          )}

          <label>
            List source
            <select
              className="source-select"
              value={source}
              onChange={(event) => setSource(event.target.value)}
            >
              <option value="pointercrate">Pointercrate Demon List</option>
              <option value="aredl">All Rated Extreme Demons List</option>
              <option value="gsl">Global Shitty List</option>
              <option value={CHALLENGE_LIST_SOURCE}>Challenge List</option>
              <option value={IMPOSSIBLE_LEVELS_SOURCE}>Impossible Levels List</option>
            </select>
          </label>

          {isRankable && (
            <div className="range-row">
              <label>
                Start rank
                <input
                  type="number"
                  step="1"
                  value={startRange}
                  onChange={(event) => handleStartChange(event.target.value)}
                  placeholder="1"
                />
              </label>
              <label>
                End rank
                <input
                  type="number"
                  step="1"
                  value={endRange}
                  onChange={(event) => handleEndChange(event.target.value)}
                  placeholder={String(rangeMax)}
                />
              </label>
              <small className="range-hint">Use arrow keys to decrease the numbers.</small>
            </div>
          )}

          <button type="submit" className="primary-button" disabled={isLoading}>
            {isLoading ? `Loading ${SOURCE_LABELS[source] ?? 'list'}...` : 'Start roulette'}
          </button>
            </form>
          </div>

          <div className="hero-column hero-column-side">
            <div className="load-panel">
          <div className="load-panel-head">
            <span className="eyebrow">Continue a run</span>
            <h3>Saved run code</h3>
          </div>
          <label className="load-field">
            <span className="visually-hidden">Saved run code</span>
            <textarea
              rows="3"
              value={loadCode}
              onChange={(event) => {
                setLoadCode(event.target.value)
                setLoadError('')
              }}
              placeholder="Paste your encoded save code here"
            />
          </label>
          <div className="action-row">
            <button type="button" className="secondary-button" onClick={handleLoad}>
              Load run
            </button>
            {savedRunCode && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setLoadCode(savedRunCode)
                  setLoadError('')
                }}
              >
                Use current save
              </button>
            )}
          </div>
          {loadError && <div className="validation-message">{loadError}</div>}
            </div>
          </div>
        </div>

      </section>
      )}
      <ChangelogDialog
        isOpen={isChangelogOpen}
        onClose={() => setIsChangelogOpen(false)}
      />
    </main>
  )
}
