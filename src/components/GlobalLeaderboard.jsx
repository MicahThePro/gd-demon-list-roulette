import { useCallback, useEffect, useState } from 'react'
import { LEADERBOARD_BOARDS, fetchLeaderboard } from '../services/apiService'
import { LIST_SOURCES, LIST_SOURCE_LABELS } from '../services/listService'
import { formatDurationMs } from '../utils/roulette'

/* The list filter, built from the same names the list loader gives a run.
 * These were retyped here and drifted once: this filter expected 'All Rated
 * Extreme Demons List' while runs were stored as 'AREDL', so selecting AREDL
 * matched nothing and its runs were only ever visible under "All lists". */
const SOURCES = [
  { id: 'all', label: 'All lists' },
  ...Object.values(LIST_SOURCES).map((name) => ({
    id: name,
    label: LIST_SOURCE_LABELS[name] ?? name,
  })),
]

const STATUS_LABELS = {
  completed: 'Cleared',
  gaveup: 'Gave up',
  failed: 'Failed',
}

const formatWhen = (timestamp) => {
  if (!Number.isFinite(timestamp)) return 'Unknown date'
  const date = new Date(timestamp)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, {
    year: sameYear ? undefined : 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * The global leaderboard, read from the Worker's D1 database.
 *
 * Separate from the local Leaderboard component on purpose: that one is a
 * personal history that lives in this browser and can be edited, while this one
 * is every run anybody has submitted. Keeping them apart means a clear-all on
 * one can never be mistaken for clearing the other.
 */
export default function GlobalLeaderboard({ user }) {
  const [board, setBoard] = useState('farthest')
  const [source, setSource] = useState('all')
  const [data, setData] = useState(null)
  // The board and list currently on screen, and the pair the data on hand is
  // for. Loading is derived from those rather than a flag, so switching board
  // or list shows the loading state without an effect having to set it.
  const [loaded, setLoaded] = useState({ board: null, source: null })
  const [error, setError] = useState('')

  const isLoading = loaded.board !== board || loaded.source !== source

  // Every setter here is called from a promise callback or an interval tick,
  // never from the effect body, so the effects below are a subscription to the
  // server rather than a render-time update.
  const load = useCallback(
    (signal) => {
      fetchLeaderboard({ board, source, signal })
        .then((result) => {
          setData(result)
          setLoaded({ board, source })
          setError('')
        })
        .catch((caught) => {
          if (caught?.name === 'AbortError') return
          setError(caught?.message ?? 'Could not load the leaderboard.')
        })
    },
    [board, source],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  // The board is re-read on a timer rather than cached, because a player who
  // just submitted a run wants to see themselves on it. Half a minute is long
  // enough not to hammer the Worker and short enough to feel live.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const controller = new AbortController()
      load(controller.signal)
    }, 30000)
    return () => window.clearInterval(intervalId)
  }, [load])

  return (
    <div className="global-board">
      <div className="global-board-bar">
        <div className="global-board-boards" role="tablist" aria-label="Leaderboard board">
          {LEADERBOARD_BOARDS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={board === entry.id}
              className={board === entry.id ? 'secondary-button small-button board-chip board-chip-active' : 'secondary-button small-button board-chip'}
              onClick={() => setBoard(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <label className="global-board-source">
          <span className="visually-hidden">Filter by list</span>
          <select value={source} onChange={(event) => setSource(event.target.value)}>
            {SOURCES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="validation-message">{error}</div>}

      {isLoading && !data && <p className="global-board-message">Loading the global leaderboard...</p>}

      {data && data.personal && (
        <p className="lb-note">
          You have submitted {data.personal.runs} run{data.personal.runs === 1 ? '' : 's'}, best{' '}
          {data.personal.best}%
          {data.you ? `, ranked #${data.you.rank} on this board.` : '. Submit a run to be ranked.'}
        </p>
      )}

      {data && data.entries.length === 0 && !error && (
        <p className="global-board-message">
          No runs on this board yet. Sign in and submit one from the results screen.
        </p>
      )}

      <div className="lb-list">
        {(data?.entries ?? []).map((entry) => {
          const isYou = user && entry.username === user.username
          return (
            <div
              key={`${entry.username}-${entry.runId}`}
              className={isYou ? 'lb-row lb-row-you' : 'lb-row'}
            >
              <span className="lb-rank">#{entry.rank}</span>
              <span className="lb-main">
                <span className="lb-top">
                  {/* The display name is what the player chose to be known by, so
                      it leads. The @handle follows it because the two are not the
                      same thing and only one of them is editable: a display name
                      can be anything, so a run ranked under "Alex" beside "@alex2"
                      is one account and not a look-alike impostor -- and printing
                      the handle is what makes that distinguishable. Showing only
                      the display name left no way to tell two players apart at
                      all. */}
                  <strong>{entry.displayName}</strong>
                  <span className="lb-handle">@{entry.username}</span>
                  {isYou && <em className="lb-you-tag">you</em>}
                  <span className="lb-sub">
                    {entry.passed} cleared · {entry.roundsPlayed} played ·{' '}
                    {formatDurationMs(entry.totalMs)}
                    {entry.timedOut ? ' · out of time' : ''} · {formatWhen(entry.createdAt)}
                  </span>
                </span>
                <span className="lb-sub">
                  {entry.source}
                  {entry.percentStep !== 1 ? ` · +${entry.percentStep}% steps` : ''} ·{' '}
                  {STATUS_LABELS[entry.status] ?? entry.status}
                </span>
              </span>
              <strong className="lb-pct">{entry.score}%</strong>
            </div>
          )
        })}
      </div>
    </div>
  )
}
