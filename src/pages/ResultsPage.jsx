import { useEffect, useState } from 'react'
import { formatDurationMs } from '../utils/roulette'

export default function ResultsPage({ run, onRestart, onSaveRun, savedRunCode }) {
  const [copyMessage, setCopyMessage] = useState('')

  useEffect(() => {
    if (!copyMessage) return undefined

    const timeoutId = window.setTimeout(() => {
      setCopyMessage('')
    }, 1200)

    return () => window.clearTimeout(timeoutId)
  }, [copyMessage])

  if (!run) {
    return null
  }

  const finalPercent = run.endingPercent ?? run.startingPercent
  const completed = run.status === 'completed'

  const timedRounds = run.rounds.filter((round) => Number.isFinite(round.elapsedMs))
  const averageTimeMs =
    timedRounds.length > 0
      ? timedRounds.reduce((total, round) => total + round.elapsedMs, 0) / timedRounds.length
      : null
  const averageTimeLabel = averageTimeMs == null ? '--:--' : formatDurationMs(averageTimeMs)

  const gaveUp = run.gaveUp === true
  // Set by the time-limit watcher rather than by a button, so the results page
  // has to explain that the clock ended the run and nobody chose to quit.
  const timeUp = run.timeUp === 'level' || run.timeUp === 'total'
  const finalLevel = run.currentLevel

  const finalLevelElapsedMs =
    gaveUp && finalLevel && Number.isFinite(run.currentLevelStartedAt) && Number.isFinite(run.gaveUpAt)
      ? Math.max(0, run.gaveUpAt - run.currentLevelStartedAt)
      : null

  const finalLevelTimeLabel =
    finalLevelElapsedMs == null || finalLevelElapsedMs < 1000
      ? '0:00'
      : formatDurationMs(finalLevelElapsedMs)

  const historyRounds = gaveUp && finalLevel ? [...run.rounds, { final: true, level: finalLevel }] : run.rounds

  return (
    <main className="page-shell results-page">
      <section className="panel results-panel">
        <p className="eyebrow">Run summary</p>
        <h2>
          {completed
            ? 'Roulette complete'
            : timeUp
              ? 'Out of time'
              : gaveUp
                ? 'You gave up'
                : 'Run ended'}
        </h2>

        {timeUp && (
          <p className="validation-message">
            {run.timeUp === 'level'
              ? 'You ran out of time on that level, so the run ended there.'
              : 'You ran out of time for the whole run, so it ended there.'}
          </p>
        )}

        <p className="results-section-label">Outcome</p>
        <div className="stats-grid">
          <div className="stat-card result-card">
            <span>Final %</span>
            <strong>{finalPercent}%</strong>
          </div>
          <div className="stat-card result-card">
            <span>Status</span>
            <strong>
              {completed ? 'Cleared' : timeUp ? 'Out of time' : gaveUp ? 'Gave up' : 'Failed'}
            </strong>
          </div>
          <div className="stat-card result-card">
            <span>Rounds</span>
            <strong>{run.rounds.length}</strong>
          </div>
        </div>

        <p className="results-section-label">Run details</p>
        <div className="stats-grid">
          <div className="stat-card result-card">
            <span>Average time / level</span>
            <strong>{averageTimeLabel}</strong>
          </div>
          <div className="stat-card result-card">
            <span>Target</span>
            <strong>{run.currentTarget}%</strong>
          </div>
          <div className="stat-card result-card">
            <span>Skips</span>
            <strong>{run.skippedCount || 0}</strong>
          </div>
          <div className="stat-card result-card">
            <span>Source</span>
            <strong className="stat-value-small">{run.source}</strong>
          </div>
        </div>

        <p className="results-section-label">
          {gaveUp ? 'Level you gave up on' : 'Round history'}
        </p>

        <div className="history-list">
          {historyRounds.length === 0 ? (
            <p>No rounds were completed.</p>
          ) : (
            historyRounds.map((round, index) => {
              const isFinal = round.final === true
              const result = isFinal ? 'gaveup' : round.result
              const timeLabel = isFinal
                ? finalLevelTimeLabel
                : (round.elapsedLabel ?? (round.elapsedMs != null ? formatDurationMs(round.elapsedMs) : '--:--'))
              const detail = isFinal
                ? `${round.level.targetPercent ?? run.currentTarget}% was required`
                : result === 'timeout'
                  ? `Ran out of time at ${round.targetPercent ?? run.currentTarget}%`
                  : round.achievedPercent == null
                    ? 'No attempt'
                    : `${round.achievedPercent}% achieved`
              const resultLabel =
                result === 'success'
                  ? 'Passed'
                  : result === 'skipped'
                    ? 'Skipped'
                    : result === 'gaveup'
                      ? 'Gave up'
                      : result === 'timeout'
                        ? 'Timed out'
                        : 'Failed'

              return (
                <div
                  key={`${round.level.id}-${index}`}
                  className={isFinal ? 'history-item history-item-final' : 'history-item'}
                >
                  {round.level.thumbnail ? (
                    <img
                      className="history-thumb"
                      src={round.level.thumbnail}
                      alt={`${round.level.name} thumbnail`}
                      loading="lazy"
                    />
                  ) : null}
                  <span className="history-index">#{index + 1}</span>
                  <span className="history-copy">
                    <strong>{round.level.name}</strong>
                    <small>{detail}</small>
                  </span>
                  <em className={`history-result history-result-${result}`}>{resultLabel}</em>
                  <small className="history-time">{timeLabel}</small>
                </div>
              )
            })
          )}
        </div>

        <div className="action-row">
          <button className="secondary-button" type="button" onClick={onRestart}>
            New run
          </button>
        </div>
      </section>
    </main>
  )
}
