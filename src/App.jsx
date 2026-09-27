import { useCallback, useMemo, useRef, useState } from 'react'
import HomePage from './pages/HomePage'
import RoulettePage from './pages/RoulettePage'
import ResultsPage from './pages/ResultsPage'
import { usePersistentRun } from './hooks/usePersistentRun'
import { useRunHistory } from './hooks/useRunHistory'
import { fetchAredlLevelDetails, fetchList } from './services/listService'
import { clampPercent, createRun, createLevelResult, decodeRunState, encodeRunState, getElapsedLevelTimeMs, getNextTargetPercent, normalizePercentStep, pickNextLevel, summarizeResult } from './utils/roulette'
import './App.css'

const SCREEN = {
  HOME: 'home',
  ROULETTE: 'roulette',
  RESULTS: 'results',
}

// The AREDL list endpoint returns no creator or video, only publisher_id, so
// those come from the per-level detail endpoint. That is fetched on demand for
// the one level on screen rather than for the whole list, which would be far
// too slow. run.source holds the list's display title.
const HYDRATABLE_SOURCES = new Set(['AREDL'])

const hydrateLevelForRun = async (runState, level) => {
  if (!level || !HYDRATABLE_SOURCES.has(runState?.source)) {
    return level
  }

  const creatorValue = typeof level.creator === 'string' ? level.creator.trim() : ''
  const thumbnailValue = typeof level.thumbnail === 'string' ? level.thumbnail.trim() : ''
  const shouldHydrate =
    !thumbnailValue ||
    !creatorValue ||
    creatorValue === 'Unknown creator' ||
    creatorValue === 'Unknown Creator'

  if (!shouldHydrate) {
    return level
  }

  const hydratedLevel = await fetchAredlLevelDetails(level)

  if (!hydratedLevel) {
    return level
  }

  return {
    ...level,
    ...hydratedLevel,
    creator: hydratedLevel.creator || level.creator || 'Unknown creator',
    thumbnail: hydratedLevel.thumbnail || level.thumbnail || null,
  }
}

function App() {
  const [screen, setScreen] = useState(SCREEN.HOME)
  const [run, setRun] = usePersistentRun()
  const history = useRunHistory()
  // Identifies the run being played, so an ended run is recorded exactly once
  // even though several code paths reach the results screen.
  const trackedRunId = useRef(null)
  const [saveCode, setSaveCode] = useState('')

  const currentStatus = useMemo(() => summarizeResult(run), [run])

  const saveCurrentRun = () => {
    if (!run) {
      return ''
    }

    const encoded = encodeRunState(run)
    setSaveCode(encoded)
    return encoded
  }

  const loadRunFromCode = (encodedCode) => {
    const decoded = decodeRunState(encodedCode)
    if (!decoded) {
      return false
    }

    setRun(decoded)
    setSaveCode(encodedCode)
    setScreen(decoded.status === 'active' ? SCREEN.ROULETTE : SCREEN.RESULTS)
    return true
  }

  const startRun = async (request = {}) => {
    const importedList = await fetchList(request)
    const percentStep = normalizePercentStep(request.percentStep ?? 1)
    const createdRun = createRun({
      startingPercent: percentStep,
      levels: importedList.levels,
      source: importedList.sourceTitle,
      allowDuplicates: false,
      percentStep,
    })

    const hydratedCurrentLevel = await hydrateLevelForRun(createdRun, createdRun.currentLevel)
    setRun({
      ...createdRun,
      currentLevel: hydratedCurrentLevel,
    })
    setScreen(SCREEN.ROULETTE)
  }

  const finishRound = async (achievedPercent) => {
    if (!run || !run.currentLevel) return

    const normalizedAchieved = clampPercent(achievedPercent)
    const isSuccess = normalizedAchieved >= run.currentTarget
    const percentStep = normalizePercentStep(run.percentStep ?? 1)
    const endedAt = Date.now()
    const currentResult = createLevelResult({
      level: run.currentLevel,
      targetPercent: run.currentTarget,
      achievedPercent: normalizedAchieved,
      result: isSuccess ? 'success' : 'failure',
      startedAt: run.currentLevelStartedAt ?? endedAt,
      endedAt,
    })

    const updatedRounds = [
      ...run.rounds,
      {
        ...currentResult,
        roundNumber: run.rounds.length + 1,
      },
    ]

    const nextTarget = isSuccess
      ? getNextTargetPercent(normalizedAchieved, percentStep)
      : run.currentTarget
    const usedLevelIds = [...(run.usedLevelIds || []), run.currentLevel.id]
    const nextLevel = pickNextLevel(run.levels, usedLevelIds, run.allowDuplicates)

    if (!isSuccess) {
      const failedRun = {
        ...run,
        status: 'failed',
        rounds: updatedRounds,
        usedLevelIds,
        endingPercent: run.currentTarget,
      }
      endRun(failedRun, endedAt)
      return
    }

    // The run finishes when the level just cleared reached 100%, not when the
    // next target would be 100. With a step of 20 the targets are 20, 40, 60,
    // 80, 100, so clearing 80 must still hand out the 100% level.
    if (normalizedAchieved >= 100) {
      const completedRun = {
        ...run,
        currentTarget: 100,
        status: 'completed',
        rounds: updatedRounds,
        usedLevelIds,
        endingPercent: 100,
        currentLevel: null,
      }
      endRun(completedRun, endedAt)
      return
    }

    const hydratedNextLevel = await hydrateLevelForRun(run, nextLevel)
    const activeRun = {
      ...run,
      currentTarget: nextTarget,
      rounds: updatedRounds,
      usedLevelIds,
      currentLevel: hydratedNextLevel,
      currentLevelStartedAt: Date.now(),
      endingPercent: nextTarget,
      status: 'active',
    }

    setRun(activeRun)
  }

  // Every path that ends a run routes through here, so a run is recorded once
  // no matter whether it was cleared, failed, or given up.
  const endRun = useCallback(
    (endedRun, endedAt = Date.now()) => {
      setRun(endedRun)
      setScreen(SCREEN.RESULTS)

      const key = endedRun.runId ?? `${endedRun.source ?? ''}-${endedRun.startedAt ?? endedAt}`
      if (trackedRunId.current === key) return
      trackedRunId.current = key
      history.recordRun(endedRun, endedAt)
    },
    [setRun, history],
  )

  const handleSkip = async () => {
    if (!run || !run.currentLevel) return

    const endedAt = Date.now()
    const currentResult = createLevelResult({
      level: run.currentLevel,
      targetPercent: run.currentTarget,
      achievedPercent: null,
      result: 'skipped',
      startedAt: run.currentLevelStartedAt ?? endedAt,
      endedAt,
    })

    const usedLevelIds = [...(run.usedLevelIds || []), run.currentLevel.id]
    const nextLevel = pickNextLevel(run.levels, usedLevelIds, run.allowDuplicates)
    const hydratedNextLevel = await hydrateLevelForRun(run, nextLevel)
    const updatedRun = {
      ...run,
      skippedCount: (run.skippedCount || 0) + 1,
      rounds: [
        ...run.rounds,
        {
          ...currentResult,
          roundNumber: run.rounds.length + 1,
        },
      ],
      usedLevelIds,
      currentLevel: hydratedNextLevel,
      currentLevelStartedAt: Date.now(),
      status: 'active',
    }

    setRun(updatedRun)
  }

  const handleGiveUp = () => {
    if (!run) return

    const failedRun = {
      ...run,
      status: 'failed',
      endingPercent: run.currentTarget,
      gaveUp: true,
      gaveUpAt: Date.now(),
    }
    endRun(failedRun)
  }

  const handleRestart = () => {
    setRun(null)
    setSaveCode('')
    trackedRunId.current = null
    setScreen(SCREEN.HOME)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <span className="brand-mark">DLR</span>
          <div>
            <strong>
              Made by{' '}
              <a
                href="https://gdbrowser.com/u/geometricalmike"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'white', textDecoration: 'none' }}
                onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                onMouseOut={(e) => e.target.style.textDecoration = 'none'}
              >
                GeometricalMike
              </a>
            </strong>
            <small>
              Dedicated to{' '}
              <a
                href="https://gdbrowser.com/u/vortrox"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'white', textDecoration: 'none' }}
                onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                onMouseOut={(e) => e.target.style.textDecoration = 'none'}
              >
                Vortrox
              </a>,{' '}
              <a
                href="https://gdbrowser.com/u/kingsammelot"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'white', textDecoration: 'none' }}
                onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                onMouseOut={(e) => e.target.style.textDecoration = 'none'}
              >
                KingSammelot
              </a>, and{' '}
              <a
                href="https://gdbrowser.com/u/zoink"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'white', textDecoration: 'none' }}
                onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                onMouseOut={(e) => e.target.style.textDecoration = 'none'}
              >
                Zoink
              </a>.
            </small>
          </div>
        </div>

        {screen !== SCREEN.HOME && run && (
          <div className="status-pill">
            <span>{run.status}</span>
            <strong>{currentStatus}</strong>
          </div>
        )}
      </header>

      {screen === SCREEN.HOME && (
        <HomePage
          onStart={startRun}
          history={history}
          onLoadRun={loadRunFromCode}
          onSaveRun={saveCurrentRun}
          run={run}
          savedRunCode={saveCode}
        />
      )}
      {screen === SCREEN.ROULETTE && run && (
        <RoulettePage
          run={run}
          onSuccess={(value) => finishRound(value)}
          onSkip={handleSkip}
          onGiveUp={handleGiveUp}
          onSaveRun={saveCurrentRun}
          onLoadRun={loadRunFromCode}
          savedRunCode={saveCode}
        />
      )}
      {screen === SCREEN.RESULTS && run && (
        <ResultsPage
          run={run}
          onRestart={handleRestart}
          onSaveRun={saveCurrentRun}
          onLoadRun={loadRunFromCode}
          savedRunCode={saveCode}
        />
      )}
    </div>
  )
}

export default App
