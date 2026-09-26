import { useEffect, useState } from 'react'
import { fetchAredlListBounds } from '../services/listService'

export default function HomePage({ onStart, onLoadRun, savedRunCode }) {
  const [isLoading, setIsLoading] = useState(false)
  const [source, setSource] = useState('pointercrate')
  const [startRange, setStartRange] = useState('')
  const [endRange, setEndRange] = useState('')
  const [aredlMax, setAredlMax] = useState(150)
  const [loadCode, setLoadCode] = useState(savedRunCode || '')
  const [loadError, setLoadError] = useState('')

  const clampAredlValue = (value, minimum = 1, maximum = aredlMax) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) {
      return minimum
    }

    return Math.min(Math.max(Math.trunc(numeric), minimum), maximum)
  }

  const normalizeAredlDraft = (value, minimum = 1, maximum = aredlMax) => {
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
    if (source !== 'aredl') {
      setAredlMax(150)
      return undefined
    }

    let isActive = true

    const loadBounds = async () => {
      const bounds = await fetchAredlListBounds()
      if (!isActive) return
      const resolvedMax = Math.max(1, Number(bounds.end) || 150)
      setAredlMax(resolvedMax)
      setStartRange((current) => {
        const raw = current === '' ? '1' : current
        return String(clampAredlValue(raw, 1, resolvedMax))
      })
      setEndRange((current) => {
        if (current === '') {
          return String(resolvedMax)
        }

        return String(clampAredlValue(current, 1, resolvedMax))
      })
    }

    loadBounds().catch(() => {
      if (isActive) {
        setAredlMax(150)
      }
    })

    return () => {
      isActive = false
    }
  }, [source])

  const handleStartChange = (value) => {
    const nextStart = value === '' ? '' : normalizeAredlDraft(value, 1, aredlMax)
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
    const nextValue = normalizeAredlDraft(value, 1, aredlMax)
    if (Number(nextValue) < minimum) {
      setEndRange(String(minimum))
      return
    }

    setEndRange(nextValue)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsLoading(true)
    try {
      const nextStart = source === 'aredl' ? clampAredlValue(startRange || '1', 1, aredlMax) : undefined
      const nextEnd = source === 'aredl' ? clampAredlValue(endRange || String(aredlMax), 1, aredlMax) : undefined

      if (source === 'aredl' && nextEnd < nextStart) {
        setEndRange(String(nextStart))
      }

      await onStart({
        source,
        start: nextStart,
        end: nextEnd,
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

  return (
    <main className="page-shell home-page">
      <section className="panel hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Geometry Dash Challenge</p>
          <h1>Demon Roulette</h1>
          <p className="lead">
            Start from a live demon list and climb the target from 1% upward.
          </p>
        </div>

        <form className="setup-form" onSubmit={handleSubmit}>
          <label>
            List source
            <select
              className="source-select"
              value={source}
              onChange={(event) => setSource(event.target.value)}
            >
              <option value="pointercrate">Pointercrate</option>
              <option value="aredl">AREDL</option>
            </select>
          </label>

          {source === 'aredl' && (
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
                  placeholder={String(aredlMax)}
                />
              </label>
              <small className="range-hint">Use arrow keys to decrease the numbers.</small>
            </div>
          )}

          <button type="submit" className="primary-button" disabled={isLoading}>
            {isLoading ? `Loading ${source === 'aredl' ? 'AREDL' : 'Pointercrate'}...` : 'Start roulette'}
          </button>
        </form>

        <div className="load-panel">
          <label>
            Saved run code
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
      </section>
    </main>
  )
}
