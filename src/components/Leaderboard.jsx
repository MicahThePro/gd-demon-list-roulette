import { useMemo, useState } from 'react'
import { unpackRound, MAX_ENTRIES } from '../hooks/useRunHistory'
import { formatDurationMs } from '../utils/roulette'

const STATUS_LABELS = {
  completed: 'Cleared',
  gaveup: 'Gave up',
  failed: 'Failed',
}

const RESULT_LABELS = {
  success: 'Passed',
  skipped: 'Skipped',
  failure: 'Failed',
  gaveup: 'Gave up',
}

const formatWhen = (timestamp) => {
  if (!Number.isFinite(timestamp)) return 'Unknown date'

  const date = new Date(timestamp)
  const now = new Date()
  const sameYear = date.getFullYear() === now.getFullYear()
  const sameDay =
    sameYear &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }

  return date.toLocaleDateString(undefined, {
    year: sameYear ? undefined : 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const RunDetail = ({ entry, onClose, onDelete }) => {
  const totalTime = entry.totalMs ? formatDurationMs(entry.totalMs) : '--:--'
  const avgTime = entry.avgMs ? formatDurationMs(entry.avgMs) : '--:--'

  return (
    <div className="lb-detail">
      <div className="lb-detail-head">
        <button type="button" className="lb-back" onClick={onClose}>
          &larr; Back
        </button>
        <div className="lb-detail-title">
          <strong>{entry.source}</strong>
          <span>
            {formatWhen(entry.at)} &middot; step +{entry.step}% &middot; {entry.roundsPlayed} levels
          </span>
        </div>
        <button
          type="button"
          className="lb-delete"
          onClick={() => {
            onDelete(entry.id)
            onClose()
          }}
        >
          Delete
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card result-card">
          <span>Outcome</span>
          <strong className="stat-value-small">{STATUS_LABELS[entry.status] ?? entry.status}</strong>
        </div>
        <div className="stat-card result-card">
          <span>Reached</span>
          <strong>{entry.score}%</strong>
        </div>
        <div className="stat-card result-card">
          <span>Total time</span>
          <strong className="stat-value-small">{totalTime}</strong>
        </div>
        <div className="stat-card result-card">
          <span>Avg / level</span>
          <strong className="stat-value-small">{avgTime}</strong>
        </div>
        <div className="stat-card result-card">
          <span>Passed</span>
          <strong>{entry.passed}</strong>
        </div>
        <div className="stat-card result-card">
          <span>Skips</span>
          <strong>{entry.skipped}</strong>
        </div>
      </div>

      <p className="results-section-label">Levels</p>
      <div className="history-list">
        {entry.rounds.length === 0 ? (
          <p>No levels were played in this run.</p>
        ) : (
          entry.rounds.map((packed, index) => {
            const round = unpackRound(packed)
            return (
              <div
                key={`${round.id ?? 'round'}-${index}`}
                className={round.result === 'gaveup' ? 'history-item history-item-final' : 'history-item'}
              >
                {round.thumbnail ? (
                  <img className="history-thumb" src={round.thumbnail} alt="" loading="lazy" />
                ) : (
                  <span className="history-thumb history-thumb-empty" aria-hidden="true" />
                )}
                <span className="history-index">#{index + 1}</span>
                <span className="history-copy">
                  <strong title={round.name}>{round.name}</strong>
                  <small>
                    {round.result === 'gaveup'
                      ? `${round.target}% was required`
                      : round.achieved == null
                        ? 'No attempt'
                        : `${round.achieved}% achieved`}
                  </small>
                </span>
                <em className={`history-result history-result-${round.result}`}>
                  {RESULT_LABELS[round.result] ?? round.result}
                </em>
                <small className="history-time">
                  {Number.isFinite(round.ms) ? formatDurationMs(round.ms) : '--:--'}
                </small>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default function Leaderboard({ entries, onDelete, onClear }) {
  const [tab, setTab] = useState('cleared')
  const [openId, setOpenId] = useState(null)

  const tabs = useMemo(
    () => [
      { key: 'cleared', label: 'Succeeded', items: entries.filter((e) => e.status === 'completed') },
      { key: 'gaveup', label: 'Gave up', items: entries.filter((e) => e.status === 'gaveup') },
    ],
    [entries],
  )

  const activeTab = tabs.find((t) => t.key === tab) ?? tabs[0]
  const openEntry = openId ? entries.find((entry) => entry.id === openId) : null

  if (openEntry) {
    return (
      <div className="lb-detail-wrap">
        <RunDetail entry={openEntry} onClose={() => setOpenId(null)} onDelete={onDelete} />
      </div>
    )
  }

  return (
    <div className="leaderboard">
      <div className="lb-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === tab}
            className={t.key === tab ? 'lb-tab lb-tab-active' : 'lb-tab'}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="lb-tab-count">{t.items.length}</span>
          </button>
        ))}
      </div>

      {activeTab.items.length === 0 ? (
        <p className="lb-empty">
          {tab === 'cleared'
            ? 'No cleared runs yet. Hit a 100% level to make this list.'
            : 'No runs given up yet.'}
        </p>
      ) : (
        <div className="lb-list">
          {activeTab.items.map((entry, index) => (
            <div key={entry.id} className="lb-row">
              <span className="lb-rank">{index + 1}</span>
              <button type="button" className="lb-main" onClick={() => setOpenId(entry.id)}>
                <span className="lb-top">
                  <strong>{entry.score}%</strong>
                  <em className={`lb-status lb-status-${entry.status}`}>
                    {STATUS_LABELS[entry.status] ?? entry.status}
                  </em>
                </span>
                <span className="lb-sub">
                  {entry.source} &middot; step +{entry.step}% &middot; {entry.roundsPlayed} levels
                  {entry.passed > 0 && ` · ${entry.passed} passed`}
                  {entry.skipped > 0 && ` · ${entry.skipped} skipped`}
                  {entry.avgMs ? ` · avg ${formatDurationMs(entry.avgMs)}` : ''}
                </span>
                <span className="lb-when">{formatWhen(entry.at)}</span>
              </button>
              <button
                type="button"
                className="lb-delete"
                onClick={() => onDelete(entry.id)}
                aria-label="Delete run"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <p className="lb-note">
          {entries.length} of {MAX_ENTRIES} runs stored. Older runs keep fewer levels.
        </p>
      )}

      {entries.length > 0 && (
        <div className="action-row">
          <button type="button" className="secondary-button" onClick={onClear}>
            Clear all runs
          </button>
        </div>
      )}
    </div>
  )
}
