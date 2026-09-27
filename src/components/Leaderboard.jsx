import { useEffect, useMemo, useState } from 'react'
import { unpackRound, MAX_ENTRIES } from '../hooks/useRunHistory'
import { formatDurationMs, decodeHistory } from '../utils/roulette'

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

export default function Leaderboard({ entries, onDelete, onClear, onExport, onImport }) {
  const [tab, setTab] = useState('cleared')
  const [openId, setOpenId] = useState(null)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importCode, setImportCode] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const [importError, setImportError] = useState(false)

  useEffect(() => {
    if (!isImportOpen) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsImportOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isImportOpen])

  const closeImport = () => {
    setIsImportOpen(false)
    setImportCode('')
    setImportMessage('')
    setImportError(false)
  }

  const handleImport = () => {
    const decoded = decodeHistory(importCode.trim())
    if (!decoded) {
      setImportError(true)
      setImportMessage('That does not look like a leaderboard code. Copy the whole code, starting with DLRH1:.')
      return
    }

    const result = onImport(decoded)

    if (result.added === 0) {
      // Keep the dialog open so the reason is visible instead of the window
      // closing with no explanation.
      setImportError(false)
      setImportMessage(
        result.skipped > 0
          ? `All ${result.skipped} run${result.skipped === 1 ? '' : 's'} in that code are already on this device.`
          : 'Nothing in that code was valid.',
      )
      return
    }

    setTab(decoded[0]?.status === 'gaveup' ? 'gaveup' : 'cleared')
    setImportError(false)
    setImportMessage(`Imported ${result.added} run${result.added === 1 ? '' : 's'}.`)
    window.setTimeout(closeImport, 900)
  }

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
          <button type="button" className="secondary-button" onClick={onExport}>
            Copy leaderboard code
          </button>
          <button type="button" className="secondary-button" onClick={() => setIsImportOpen(true)}>
            Import leaderboard code
          </button>
          <button type="button" className="secondary-button" onClick={onClear}>
            Clear all runs
          </button>
        </div>
      )}

      {isImportOpen && (
        <div
          className="modal-backdrop"
          onClick={closeImport}
          role="presentation"
        >
          <div
            className="modal modal-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="import-dialog-title">Import leaderboard</h2>
            <p>
              Paste a leaderboard code to add its runs to this device. Existing
              runs are kept, and anything already here is skipped rather than
              duplicated.
            </p>
            <label className="modal-field">
              <span className="visually-hidden">Leaderboard code</span>
              <textarea
                rows="4"
                value={importCode}
                onChange={(event) => {
                  setImportCode(event.target.value)
                  setImportMessage('')
                }}
                placeholder="Paste your DLRH1: code here"
                autoFocus
              />
            </label>
            {importMessage && (
              <div className={importError ? 'validation-message' : 'import-success'}>
                {importMessage}
              </div>
            )}
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={closeImport}>
                Cancel
              </button>
              <button className="primary-button" type="button" onClick={handleImport}>
                Import runs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
