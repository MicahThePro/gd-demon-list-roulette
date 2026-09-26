import { useEffect, useRef, useState } from 'react'
import { formatDurationMs } from '../utils/roulette'

export default function RoulettePage({ run, onSuccess, onSkip, onGiveUp, onSaveRun, savedRunCode }) {
  const [achievedPercent, setAchievedPercent] = useState('')
  const [validationMessage, setValidationMessage] = useState('')
  const [levelCopyMessage, setLevelCopyMessage] = useState('')
  const [saveCopyMessage, setSaveCopyMessage] = useState('')

  useEffect(() => {
    setAchievedPercent('')
    setValidationMessage('')
  }, [run.currentTarget, run.currentLevel?.id])

  useEffect(() => {
    if (!levelCopyMessage) return undefined

    const timeoutId = window.setTimeout(() => {
      setLevelCopyMessage('')
    }, 1200)

    return () => window.clearTimeout(timeoutId)
  }, [levelCopyMessage])

  useEffect(() => {
    if (!saveCopyMessage) return undefined

    const timeoutId = window.setTimeout(() => {
      setSaveCopyMessage('')
    }, 1200)

    return () => window.clearTimeout(timeoutId)
  }, [saveCopyMessage])

  const [displayElapsed, setDisplayElapsed] = useState(0)

  useEffect(() => {
    if (!run || !run.currentLevel) return undefined

    const startedAt = run.currentLevelStartedAt ?? Date.now()
    const tick = () => {
      setDisplayElapsed(Date.now() - startedAt)
    }

    tick()
    const intervalId = window.setInterval(tick, 250)

    return () => window.clearInterval(intervalId)
  }, [run.currentLevel?.id, run.currentLevelStartedAt])

  if (!run || !run.currentLevel) {
    return null
  }

  const challengeEntries = run.rounds.map((round, index) => ({
    id: `${round.level?.id ?? 'round'}-${index}`,
    name: round.level?.name ?? 'Unknown level',
    creator: round.level?.creator ?? 'Unknown creator',
    thumbnail: round.level?.thumbnail ?? null,
    target: round.targetPercent ?? run.currentTarget,
    result: round.result,
    achieved: round.achievedPercent,
    elapsedLabel: round.elapsedLabel ?? (Number.isFinite(round.elapsedMs) ? formatDurationMs(round.elapsedMs) : null),
    isCurrent: false,
  }))

  const challengeListRef = useRef(null)

  useEffect(() => {
    if (!challengeListRef.current) return
    challengeListRef.current.scrollTop = challengeListRef.current.scrollHeight
  }, [challengeEntries.length])

  const handleInputChange = (value) => {
    const sanitized = value.replace(/%/g, '')

    if (sanitized === '') {
      setAchievedPercent('')
      setValidationMessage(`You can't enter nothing. You need at least ${run.currentTarget}%`)
      return
    }

    const numeric = Number(sanitized)
    if (!Number.isFinite(numeric)) {
      setAchievedPercent('')
      setValidationMessage(`You can't enter anything below ${run.currentTarget}%`)
      return
    }

    if (numeric < run.currentTarget) {
      setAchievedPercent(String(numeric))
      setValidationMessage(`You can't enter less than ${run.currentTarget}%`)
      return
    }

    const clamped = Math.min(100, numeric)
    setAchievedPercent(String(clamped))
    setValidationMessage('')
  }

  return (
    <main className="page-shell roulette-page">
      <div className="roulette-layout">
        <section className="panel status-panel">
          <div className="status-header">
            <div>
              <p className="eyebrow">Round {run.rounds.length + 1}</p>
              <h2>Target {run.currentTarget}%</h2>
            </div>
            <div className="status-actions">
              <span className="badge">{run.source}</span>
              <div className="save-copy-inline">
                <button
                  className="secondary-button small-button"
                  type="button"
                  onClick={() => {
                    const encoded = onSaveRun()
                    if (encoded) {
                      navigator.clipboard?.writeText(encoded)
                      setSaveCopyMessage('Copied successfully')
                      setLevelCopyMessage('')
                    }
                  }}
                >
                  Copy save code
                </button>
                {saveCopyMessage && <div className="copy-toast save-toast-inline">{saveCopyMessage}</div>}
              </div>
            </div>
          </div>

          <div className="level-card">
            {run.currentLevel.thumbnail && (
              <a
                className="level-thumbnail-link"
                href={run.currentLevel.permalink || run.currentLevel.detailUrl}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  className="level-thumbnail"
                  src={run.currentLevel.thumbnail}
                  alt={`${run.currentLevel.name} thumbnail`}
                  loading="lazy"
                />
              </a>
            )}

            <p className="level-meta">#{run.currentLevel.position} on the list</p>
            <h3>{run.currentLevel.name}</h3>
            <p>{run.currentLevel.creator ? `By ${run.currentLevel.creator}` : 'Community pick'}</p>
            <div className="timer-badge">Time: {formatDurationMs(displayElapsed)}</div>
            <button
              className="level-id-link level-id-button"
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(String(run.currentLevel.levelId ?? run.currentLevel.id))
                setLevelCopyMessage('Copied!')
                setSaveCopyMessage('')
              }}
            >
              Level ID: {run.currentLevel.levelId ?? run.currentLevel.id}
            </button>
            {levelCopyMessage && <div className="copy-toast">{levelCopyMessage}</div>}
          </div>

          <div className="result-form">
            <label>
              Achieved percentage
              <input
                type="number"
                min={run.currentTarget}
                max="100"
                value={achievedPercent}
                placeholder={`${run.currentTarget}%`}
                onChange={(event) => handleInputChange(event.target.value)}
              />
            </label>
            {validationMessage && <div className="validation-message">{validationMessage}</div>}
          </div>

          <div className="action-row">
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                const numericValue = achievedPercent === '' ? run.currentTarget : Number(achievedPercent)
                onSuccess(numericValue)
              }}
              disabled={achievedPercent === '' || Number(achievedPercent) < run.currentTarget}
            >
              Success
            </button>
            <button className="secondary-button" type="button" onClick={onSkip}>
              Skip
            </button>
            <button className="secondary-button" type="button" onClick={onGiveUp}>
              Give up
            </button>
          </div>

        </section>

        <aside className="panel challenge-panel">
          <div className="challenge-header">
            <p className="eyebrow">Challenge board</p>
            <h3>Levels</h3>
          </div>

          <div className="challenge-list" ref={challengeListRef}>
            {challengeEntries.map((entry) => (
              <div key={entry.id} className="challenge-item">
                {entry.thumbnail && (
                  <img src={entry.thumbnail} alt={`${entry.name} thumbnail`} className="challenge-thumb" loading="lazy" />
                )}
                <div className="challenge-copy">
                  <strong>{entry.name}</strong>
                  <span>{entry.creator}</span>
                  <small>
                    {entry.result === 'skipped' ? `Skipped • ${entry.target}%` : `Target ${entry.target}%`}
                    {entry.achieved !== null && entry.achieved !== undefined ? ` • ${entry.achieved}%` : ''}
                    {entry.elapsedLabel ? ` • ${entry.elapsedLabel}` : ''}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  )
}
