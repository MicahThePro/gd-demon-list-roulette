import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDurationMs } from '../utils/roulette'
import { adminDecide, fetchAdminSubmissions } from '../services/submissionService'
import { PLAYABLE, getHostLabel } from '../utils/videoFile'

const FILTERS = [
  { id: 'pending', label: 'Waiting' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
]

/* The passcode is kept in a cookie so the panel does not ask for it on every
   visit. A cookie rather than localStorage because it can be told to expire,
   and it is sent nowhere except this site's own requests for it. It is
   readable by script on this page by design: the panel has to send it on every
   admin call, so it has to be reachable from script. That is the cost of a
   shared passcode rather than an account, and it is why the passcode should be
   treated as one moderator's key. */
const PASSCODE_COOKIE = 'dlr_admin'
const REMEMBER_DAYS = 30

const readCookie = (name) => {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

const writeCookie = (name, value, days) => {
  if (typeof document === 'undefined') return
  const maxAge = days * 24 * 60 * 60
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`
}

/* Only WebM and MP4 play in a browser without a codec installed. The other
   three are accepted, because a player may have the file already, but a
   moderator has to be told rather than left with a black box and no idea
   whether the video is broken or the container is unsupported. */
// (PLAYABLE lives with the link helpers in utils/videoFile, so the results
// screen and this panel agree on which types open inline.)

const formatWhen = (timestamp) =>
  Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : 'unknown date'

/**
 * The moderation panel.
 *
 * Reached at /admin, and guarded by the passcode rather than by the URL being
 * secret. Nothing here is mentioned in the changelog or anywhere else on the
 * site: the passcode is stored as a Worker secret, compared with the same
 * constant-time check as a password, and every admin call re-checks it.
 *
 * A decision needs the video, so the player is the centre of the panel and the
 * run's own numbers sit beside it, including the recording window against the
 * run's length. A recording far shorter than the run is the thing to look for.
 */
export default function AdminPage({ onExit }) {
  const [error, setError] = useState('')
  const [enteredPasscode, setEnteredPasscode] = useState('')
  const [filter, setFilter] = useState('pending')
  const [submissions, setSubmissions] = useState([])
  const [selected, setSelected] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [note, setNote] = useState('')
  const [remember, setRemember] = useState(true)
  // Starts from the cookie, so a return visit goes straight to the queue
  // instead of asking for the passcode again.
  const [isUnlocked, setIsUnlocked] = useState(() => Boolean(readCookie(PASSCODE_COOKIE)))
  const activePasscode = useRef(readCookie(PASSCODE_COOKIE) ?? '')

  const load = useCallback(async (code, status) => {
    setIsLoading(true)
    setError('')
    try {
      const list = await fetchAdminSubmissions(code, status)
      setSubmissions(list)
      setSelected((current) => (current && list.find((entry) => entry.id === current.id)) ?? list[0] ?? null)
    } catch (caught) {
      setError(caught?.message ?? 'Could not load the queue.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Unlocking is the same request as loading, so a wrong passcode and a
  // working one are told apart by whether the queue comes back.
  const handleUnlock = async (event) => {
    event.preventDefault()
    const entered = enteredPasscode.trim()
    if (!entered) {
      setError('Enter the passcode.')
      return
    }
    setIsLoading(true)
    setError('')
    try {
      const list = await fetchAdminSubmissions(entered, filter)
      activePasscode.current = entered
      // Only kept if the box was ticked, and cleared again by signing out, so
      // a shared computer does not stay unlocked.
      if (remember) {
        writeCookie(PASSCODE_COOKIE, entered, REMEMBER_DAYS)
      }
      setSubmissions(list)
      setIsUnlocked(true)
      setSelected(list[0] ?? null)
    } catch (caught) {
      setError(caught?.status === 401 ? 'Wrong passcode.' : (caught?.message ?? 'Could not load the queue.'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignOut = () => {
    writeCookie(PASSCODE_COOKIE, '', 0)
    activePasscode.current = ''
    setIsUnlocked(false)
    setSubmissions([])
    setSelected(null)
  }

  useEffect(() => {
    if (!isUnlocked) {
      return undefined
    }
    load(activePasscode.current, filter)
  }, [filter, isUnlocked, load])

  /* The video is NOT fetched by this page. It lives on the player's own host,
     so there is nothing to stream and nothing to hold in memory: the panel shows
     the link and a moderator opens it. That also means a link that has since
     been deleted or made private is a real possibility, which is why the file
     type is shown next to it. */
  useEffect(() => {
    // The selected submission is the only thing the detail pane reacts to, and
    // nothing needs loading, so this exists only to reset the stale error from
    // the previous one when the reviewer moves on.
  }, [selected?.id])

  const decide = async (action) => {
    if (!selected) return
    try {
      await adminDecide(activePasscode.current, selected.id, action, note)
      setNote('')
      await load(activePasscode.current, filter)
    } catch (caught) {
      setError(caught?.message ?? `Could not ${action} that submission.`)
    }
  }

  if (!isUnlocked) {
    return (
      <main className="page-shell admin-page">
        <section className="panel admin-gate">
          <p className="eyebrow">Moderation</p>
          <h2>Passcode</h2>
          <form onSubmit={handleUnlock}>
            <label>
              Passcode
              <input
                type="password"
                value={enteredPasscode}
                autoFocus
                onChange={(event) => {
                  setEnteredPasscode(event.target.value)
                  setError('')
                }}
              />
            </label>
            <label className="admin-remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              Keep me signed in on this browser
            </label>
            {error && <div className="validation-message">{error}</div>}
            <div className="action-row">
              <button type="submit" className="primary-button" disabled={isLoading}>
                {isLoading ? 'Checking...' : 'Unlock'}
              </button>
              <button type="button" className="secondary-button" onClick={onExit}>
                Back to the site
              </button>
            </div>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="page-shell admin-page">
      <section className="panel admin-panel">
        <header className="board-page-bar">
          <div>
            <p className="eyebrow">Moderation</p>
            <h2>Submissions</h2>
          </div>
          <button type="button" className="secondary-button" onClick={handleSignOut}>
            Lock
          </button>
          <button type="button" className="secondary-button" onClick={onExit}>
            Back to the site
          </button>
        </header>

        <div className="board-view-tabs" role="tablist" aria-label="Queue">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={filter === entry.id}
              className={filter === entry.id ? 'board-view-tab board-view-tab-active' : 'board-view-tab'}
              onClick={() => setFilter(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {error && <div className="validation-message">{error}</div>}

        <div className="admin-body">
          <div className="admin-queue">
            {isLoading && <p className="global-board-message">Loading...</p>}
            {!isLoading && submissions.length === 0 && (
              <p className="global-board-message">Nothing here.</p>
            )}
            {submissions.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={selected?.id === entry.id ? 'admin-queue-row admin-queue-row-active' : 'admin-queue-row'}
                onClick={() => setSelected(entry)}
              >
                <strong>{entry.displayName}</strong>
                <small>
                  {entry.score}% · {entry.source} · {formatWhen(entry.createdAt)}
                </small>
                <em className={`lb-sub admin-status-${entry.status}`}>{entry.status}</em>
              </button>
            ))}
          </div>

          <div className="admin-detail">
            {!selected ? (
              <p className="global-board-message">Pick a submission to review it.</p>
            ) : (
              <>
                <div className="admin-detail-head">
                  <h3>{selected.displayName}</h3>
                  <p className="lb-sub">
                    @{selected.username} · {selected.source} · submitted {formatWhen(selected.createdAt)}
                  </p>
                </div>

                <div className="admin-facts">
                  <span>Reached<strong>{selected.score}%</strong></span>
                  <span>Cleared<strong>{selected.passed}</strong></span>
                  <span>Played<strong>{selected.roundsPlayed}</strong></span>
                  <span>Skipped<strong>{selected.skipped}</strong></span>
                  <span>
                    Run time<strong>{formatDurationMs(selected.totalMs)}</strong>
                  </span>
                  <span>
                    Step<strong>+{selected.percentStep}%</strong>
                  </span>
                  <span>
                    File<strong>
                      {(selected.sizeBytes / (1024 * 1024)).toFixed(1)} MB {selected.container}
                    </strong>
                  </span>
                </div>

                <div className="admin-video-box">
                  <p className="settings-hint">
                    The video is on the player&rsquo;s own host, so this is a link rather than a
                    file. Open it, watch the whole run, and compare it against the rounds below.
                  </p>
                  {/* The link goes out to somewhere the player chose, so it opens
                      in a new tab with no referrer and no opener, and it is never
                      turned into an <iframe>: a page the site does not control
                      cannot be safely framed. */}
                  <a
                    className="admin-video-link"
                    href={selected.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer external nofollow"
                  >
                    Open the video
                    <small>{getHostLabel(selected.videoUrl)}</small>
                  </a>
                  {selected.note && (
                    <p className="settings-hint">
                      From the player: {selected.note}
                    </p>
                  )}
                  <p className="settings-hint">
                    File type given: {selected.container.toUpperCase()}.
                    {PLAYABLE.has(selected.container)
                      ? ' That opens inline in most browsers.'
                      : ' A browser will usually download that rather than play it, so open it in a video player.'}
                  </p>
                </div>

                <details className="admin-rounds">
                  <summary>Rounds ({selected.rounds.length})</summary>
                  <div className="lb-list">
                    {selected.rounds.map((round, index) => (
                      <div key={`${round.name}-${index}`} className="lb-row">
                        <span className="lb-rank">#{index + 1}</span>
                        <span className="lb-main">
                          <span className="lb-top">
                            <strong>{round.name}</strong>
                          </span>
                          <span className="lb-sub">
                            {round.result === 'success'
                              ? `${round.achieved}% hit`
                              : round.result === 'skipped'
                                ? `skipped, ${round.skipReason ?? 'no reason given'}`
                                : round.result === 'gaveup'
                                  ? 'gave up here'
                                  : round.result === 'timeout'
                                    ? 'ran out of time'
                                    : `${round.achieved ?? 0}% of ${round.target}%`}
                            {Number.isFinite(round.ms) ? ` · ${formatDurationMs(round.ms)}` : ''}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </details>

                <label className="admin-note">
                  Note for the player
                  <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} />
                </label>

                <div className="action-row">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => decide('approve')}
                    disabled={selected.status === 'approved'}
                  >
                    Add to leaderboard
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => decide('reject')}
                    disabled={selected.status === 'rejected'}
                  >
                    Reject
                  </button>
                  <button type="button" className="secondary-button" onClick={() => decide('delete')}>
                    Delete run
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
