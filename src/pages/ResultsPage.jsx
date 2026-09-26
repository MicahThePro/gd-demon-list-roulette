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

  return (
    <main className="page-shell results-page">
      <section className="panel results-panel">
        <p className="eyebrow">Run summary</p>
        <h2>{completed ? 'Roulette complete' : 'Run ended'}</h2>

        <div className="stats-grid">
          <div className="stat-card result-card">
            <span>Final %</span>
            <strong>{finalPercent}%</strong>
          </div>
          <div className="stat-card result-card">
            <span>Rounds</span>
            <strong>{run.rounds.length}</strong>
          </div>
          <div className="stat-card result-card">
            <span>Status</span>
            <strong>{completed ? 'Cleared' : 'Failed'}</strong>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card result-card">
            <span>Skips</span>
            <strong>{run.skippedCount || 0}</strong>
          </div>
          <div className="stat-card result-card">
            <span>Source</span>
            <strong>{run.source}</strong>
          </div>
          <div className="stat-card result-card">
            <span>Target</span>
            <strong>{run.currentTarget}%</strong>
          </div>
        </div>

        <div className="history-list">
          {run.rounds.length === 0 ? (
            <p>No rounds were completed.</p>
          ) : (
            run.rounds.map((round, index) => (
              <div key={`${round.level.id}-${index}`} className="history-item">
                <span>#{index + 1}</span>
                <strong>{round.level.name}</strong>
                <em>{round.result === 'success' ? 'Passed' : round.result === 'skipped' ? 'Skipped' : 'Failed'}</em>
                <small>
                  {round.achievedPercent == null ? 'Skipped' : `${round.achievedPercent}%`}
                  {round.elapsedLabel ? ` • ${round.elapsedLabel}` : ''}
                  {round.elapsedMs != null && !round.elapsedLabel ? ` • ${formatDurationMs(round.elapsedMs)}` : ''}
                </small>
              </div>
            ))
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
