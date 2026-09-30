import { useEffect, useState } from 'react'
import {
  deleteAccount,
  fetchAccount,
  fetchAuditLog,
  issueLoginCode,
  revokeLoginCode,
  searchAccounts,
  trashRun,
  untrashRun,
} from '../services/adminService'

/* The two things a moderator does with an account, and the two ways they can go
   wrong. Issued and issued are worded so a glance at the screen says whether a
   live code exists, rather than making the reader remember. */

const formatWhen = (timestamp) => {
  if (!Number.isFinite(timestamp)) return 'unknown date'
  return new Date(timestamp).toLocaleString()
}

const formatAgo = (timestamp) => {
  if (!Number.isFinite(timestamp)) return 'never'
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

const SUBMISSION_LABELS = {
  pending: 'Waiting',
  approved: 'Approved',
  rejected: 'Rejected',
}

const AuditLog = ({ passcode }) => {
  const [entries, setEntries] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetchAuditLog(passcode, controller.signal)
      .then(setEntries)
      .catch((caught) => {
        if (caught?.name !== 'AbortError') setError(caught?.message ?? 'Could not read the log.')
      })
    return () => controller.abort()
  }, [passcode])

  if (error) {
    return <div className="validation-message">{error}</div>
  }

  if (entries.length === 0) {
    return <p className="settings-hint">Nothing has been done from this panel yet.</p>
  }

  return (
    <div className="admin-audit">
      <p className="settings-hint">
        Every account deletion and every login code, newest first. So a leaked
        passcode leaves a trail rather than nothing.
      </p>
      <ul className="admin-audit-list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <strong>{entry.action}</strong>
            {entry.targetName && <span> · {entry.targetName}</span>}
            <span className="admin-audit-when">{formatWhen(entry.at)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const AccountDetail = ({ passcode, accountId, onBack, onChanged }) => {
  const [account, setAccount] = useState(null)
  const [error, setError] = useState('')
  // The code is held in component state and never fetched again: the Worker only
  // ever returns it once, at the moment it is issued. There is nothing to re-read,
  // so this is the only copy the panel will ever have.
  const [issuedCode, setIssuedCode] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [isWorking, setIsWorking] = useState(false)
  // The run whose trash box is open, or null. This answers "which run is the
  // moderator part way through trashing", and nothing else -- it is null whenever
  // no box is open, which is the normal case.
  //
  // It is deliberately NOT the run list's condition. That list is gated on
  // `account.runs.length`, and reading this state as the gate made every account
  // report "no saved runs" except one that happened to be mid-trash. Two
  // different questions, two different answers; keep them apart.
  const [trashRunId, setTrashRunId] = useState(null)
  const [trashReason, setTrashReason] = useState('')
  // Whether the trashed runs are on screen. Off by default, because the point of
  // trashing is that the run stops being part of this account as far as anybody
  // looking at it is concerned -- leaving it in the list, even greyed out and
  // struck through, meant a trashed run was still what you saw when you opened
  // the account.
  //
  // A toggle rather than a removal, because the reason the row is kept at all is
  // to be able to take a decision back. Un-trashing is only reachable from here,
  // so hiding them with no way back would make a mistake permanent.
  const [showTrashed, setShowTrashed] = useState(false)
  // The run with a request in flight, or null. Separate from trashRunId: a row
  // stays "busy" after its box closes, and one flag for the whole panel would
  // lock every row while a single one was being trashed.
  const [busyRunId, setBusyRunId] = useState(null)

  // Fetching in the effect itself rather than through a callback that the effect
  // then calls: the state updates then belong to the subscription's own callback,
  // rather than to a synchronous call made during the effect body.
  //
  // `isLoading` is derived rather than set, because a fetch in flight is exactly
  // "we have no account for this id yet", and deriving it means there is no
  // render-time write to keep in step with the request.
  useEffect(() => {
    const controller = new AbortController()
    let isActive = true

    fetchAccount(passcode, accountId, controller.signal)
      .then((next) => {
        if (isActive) setAccount(next)
      })
      .catch((caught) => {
        if (isActive && caught?.name !== 'AbortError') {
          setError(caught?.message ?? 'Could not open that account.')
        }
      })

    return () => {
      isActive = false
      controller.abort()
    }
  }, [passcode, accountId])

  // Nothing loaded for this id yet means it is still loading.
  const isLoading = !account

  const reload = async () => {
    setError('')
    try {
      setAccount(await fetchAccount(passcode, accountId))
    } catch (caught) {
      setError(caught?.message ?? 'Could not open that account.')
    }
  }

  const handleIssue = async () => {
    setIsWorking(true)
    setError('')
    try {
      const result = await issueLoginCode(passcode, accountId)
      setIssuedCode(result.code)
      await reload()
      onChanged?.()
    } catch (caught) {
      setError(caught?.message ?? 'Could not issue a code.')
    } finally {
      setIsWorking(false)
    }
  }

  const handleRevoke = async () => {
    setIsWorking(true)
    setError('')
    try {
      await revokeLoginCode(passcode, accountId)
      setIssuedCode('')
      await reload()
    } catch (caught) {
      setError(caught?.message ?? 'Could not revoke that code.')
    } finally {
      setIsWorking(false)
    }
  }

  const handleDelete = async () => {
    if (!account) return
    setIsWorking(true)
    setError('')
    try {
      await deleteAccount(passcode, accountId, deleteConfirm)
      onChanged?.()
      onBack()
    } catch (caught) {
      setError(caught?.message ?? 'Could not delete that account.')
    } finally {
      setIsWorking(false)
    }
  }

  /* Trashing and un-trashing a run. Both are one request and one re-read of the
     account, rather than a local edit of the row: the server is what decides
     whether the run is hidden from the leaderboard, the player's own board and
     the queue, and a row that merely looked trashed on this screen would be a
     lie the moment the page was reloaded. */
  const handleTrash = async (run, reason) => {
    setBusyRunId(run.id)
    setError('')
    try {
      await trashRun(passcode, accountId, run.id, reason)
      await reload()
      onChanged?.()
    } catch (caught) {
      setError(caught?.message ?? 'Could not trash that run.')
    } finally {
      setBusyRunId(null)
    }
  }

  const handleUntrash = async (run) => {
    setBusyRunId(run.id)
    setError('')
    try {
      await untrashRun(passcode, accountId, run.id)
      await reload()
      onChanged?.()
    } catch (caught) {
      setError(caught?.message ?? 'Could not put that run back.')
    } finally {
      setBusyRunId(null)
    }
  }

  if (isLoading && !account) {
    return <p className="global-board-message">Loading...</p>
  }

  if (!account) {
    return (
      <>
        <div className="action-row">
          <button type="button" className="secondary-button" onClick={onBack}>
            Back to accounts
          </button>
        </div>
        {error && <div className="validation-message">{error}</div>}
      </>
    )
  }

  const data = account.playerData ?? {}
  const history = Array.isArray(data.history) ? data.history : []
  const hasLiveCode = account.loginCode?.hasCode === true
  // Only offer delete once the typed username matches, so it cannot be fired off
  // at the wrong row. The Worker checks it again against its own record.
  const canDelete = deleteConfirm.trim().toLowerCase() === account.username.toLowerCase()

  /* The run list, split in two.
   *
   * The runs on screen and the trashed runs are separate lists, not one list
   * with the trashed ones greyed out. A trashed run leaves the list -- that is
   * what trashing is for, and it was still the thing you saw when you opened the
   * account -- and it is kept in its own section, collapsed, so a decision can be
   * taken back without it competing with the runs that are actually on the
   * account.
   *
   * The split is derived rather than tracked, so it cannot fall out of step with
   * the runs themselves after a trash, an un-trash, or a re-read. */
  const allRuns = Array.isArray(account.runs) ? account.runs : []
  const trashedRuns = allRuns.filter((run) => run.trashed)
  const trashedCount = trashedRuns.length
  const liveRuns = allRuns.filter((run) => !run.trashed)

  return (
    <>
      <div className="admin-detail-head">
        <button type="button" className="lb-back" onClick={onBack}>
          &larr; Accounts
        </button>
        <div className="lb-detail-title">
          <strong>{account.displayName || account.username}</strong>
          <span>
            @{account.username} · joined {formatWhen(account.createdAt)}
          </span>
        </div>
      </div>

      {error && <div className="validation-message">{error}</div>}

      <div className="admin-facts">
        {/* The live count, not the lifetime total. A trashed run is no longer a
            run on this account, and leaving it in the headline number is the
            same mistake as leaving it in the list. */}
        <span>Runs<strong>{liveRuns.length}</strong></span>
        {trashedCount > 0 && <span>Trashed<strong>{trashedCount}</strong></span>}
        <span>Submitted<strong>{account.submissionCount}</strong></span>
        <span>Waiting<strong>{account.pendingCount}</strong></span>
        <span>Last seen<strong>{formatAgo(account.syncedAt)}</strong></span>
      </div>

      <div className="admin-account-section">
        <h3>Sign in as them</h3>
        <p className="settings-hint">
          A code signs this browser in as {account.username} once. There is no
          password to see and none to change &mdash; passwords are stored as
          one-way hashes, so they cannot be read back by anybody. Redeeming the
          code gives an ordinary session: it can do anything that account can do,
          and signing out ends it. The code stops working the moment it is used.
        </p>

        {issuedCode ? (
          <div className="admin-code-box">
            <p className="settings-hint">
              Copy this now. It is not stored anywhere readable and cannot be
              shown again &mdash; if you lose it, issue another.
            </p>
            <code className="admin-code">{issuedCode}</code>
            <div className="action-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() => navigator.clipboard?.writeText(issuedCode)}
              >
                Copy code
              </button>
              <button type="button" className="secondary-button" onClick={handleRevoke} disabled={isWorking}>
                Throw this code away
              </button>
            </div>
          </div>
        ) : (
          <div className="action-row">
            <button
              type="button"
              className="primary-button"
              onClick={handleIssue}
              disabled={isWorking || hasLiveCode}
            >
              {hasLiveCode ? 'A code is already out' : 'Issue a login code'}
            </button>
            {hasLiveCode && (
              <button type="button" className="secondary-button" onClick={handleRevoke} disabled={isWorking}>
                Revoke it
              </button>
            )}
          </div>
        )}
        {hasLiveCode && !issuedCode && (
          <p className="settings-hint">
            A code was issued {formatAgo(account.loginCode.issuedAt)} and has not
            been used. It is not readable, so issuing a new one replaces it.
          </p>
        )}
        {account.loginCode?.usedAt && (
          <p className="settings-hint">The last code was used {formatAgo(account.loginCode.usedAt)}.</p>
        )}
      </div>

      <div className="admin-account-section">
        <h3>Their browser data</h3>
        {!account.syncedAt ? (
          <p className="settings-hint">
            This account has not uploaded a copy of their browser. The runs
            listed above come from the account itself, not from here, so they are
            the same on every device they sign in on.
          </p>
        ) : (
          <>
            <p className="settings-hint">
              A copy of the history and settings held in their browser, uploaded
              {formatAgo(account.syncedAt)}. This is a mirror: it is only as
              current as the last time they loaded the site.
            </p>
            {history.length === 0 ? (
              <p className="settings-hint">No runs recorded.</p>
            ) : (
              <div className="admin-data-list">
                {history.map((entry) => (
                  <div key={entry.id} className="admin-data-row">
                    <strong>{entry.score}%</strong>
                    <span>{entry.source}</span>
                    <span>{entry.status}</span>
                    <span>{entry.roundsPlayed} levels</span>
                    <span>{formatWhen(entry.at)}</span>
                  </div>
                ))}
              </div>
            )}
            {data.settings && (
              <p className="settings-hint">
                Settings: {Object.entries(data.settings).map(([key, value]) => `${key}=${String(value)}`).join(', ')}
              </p>
            )}
          </>
        )}
      </div>

      <div className="admin-account-section">
        <h3>All their runs</h3>
        <p className="settings-hint">
          Every run saved to this account, whether or not it was ever sent for
          review, newest first. Trashing takes one out of this list entirely: off
          the global leaderboard, out of their own runs, and out of the queue. The
          run itself is not destroyed, so it can be put back.
        </p>

        {liveRuns.length === 0 ? (
          <p className="settings-hint">
            {trashedCount > 0
              ? 'Nothing left on this account. Everything saved to it has been trashed, and the trashed runs are below.'
              : 'This account has no saved runs. Runs reach an account when the player signs in on the results screen and keeps the run they just finished.'}
          </p>
        ) : (
          <div className="admin-data-list">
            {liveRuns.map((run) => (
              <div key={run.id} className="admin-data-row">
                <strong>{run.score}%</strong>
                <span>{run.source}</span>
                <span>{run.passed} passed &middot; {run.roundsPlayed} levels</span>
                <em className={`lb-sub ${run.submission ? `admin-status-${run.submission.status}` : ''}`}>
                  {run.submission ? (SUBMISSION_LABELS[run.submission.status] ?? run.submission.status) : 'Not submitted'}
                </em>
                <span>{formatWhen(run.createdAt)}</span>
                <button
                  type="button"
                  className="secondary-button small-button"
                  onClick={() => {
                    setTrashRunId(run.id)
                    setTrashReason('')
                  }}
                  disabled={busyRunId !== null}
                >
                  Trash
                </button>
              </div>
            ))}
          </div>
        )}

        {/* The confirm box replaces the row's own button rather than sitting under
            the whole list, so the reason for trashing one particular run is typed
            next to that run and there is never a question of which one it refers
            to. */}
        {trashRunId !== null && (
          <div className="admin-trash-box">
            <label className="admin-note">
              Why are you trashing this run? (optional, goes in the log)
              <input
                value={trashReason}
                onChange={(event) => setTrashReason(event.target.value)}
                maxLength={200}
                autoComplete="off"
              />
            </label>
            <div className="action-row">
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  const run = liveRuns.find((entry) => entry.id === trashRunId)
                  setTrashRunId(null)
                  if (run) handleTrash(run, trashReason)
                }}
                disabled={busyRunId !== null}
              >
                Trash this run
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setTrashRunId(null)}
                disabled={busyRunId !== null}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* The trashed runs, in a section of their own rather than as greyed rows
          among the live ones. They are gone from the list above -- that is what
          trashing means, and a run you have trashed should not be the thing you
          see when you open an account -- but they are kept here so the decision
          can be taken back. Collapsed by default: an account with nothing trashed
          shows no heading and no empty state, and one with something trashed does
          not make it the first thing on screen. */}
      {trashedCount > 0 && (
        <div className="admin-account-section">
          <div className="admin-trash-head">
            <h3>Trashed</h3>
            <button
              type="button"
              className="secondary-button small-button"
              onClick={() => setShowTrashed((value) => !value)}
              aria-expanded={showTrashed}
            >
              {showTrashed ? 'Hide' : `Show ${trashedCount}`}
            </button>
          </div>

          {!showTrashed ? (
            <p className="settings-hint">
              {trashedCount} run{trashedCount === 1 ? '' : 's'} trashed. These are off the
              leaderboard and out of this player&rsquo;s runs.
            </p>
          ) : (
            <>
              <p className="settings-hint">
                Putting one back restores it everywhere at once, with the statistics and the
                leaderboard rank it had before.
              </p>
              <div className="admin-data-list">
                {trashedRuns.map((run) => (
                  <div key={run.id} className="admin-data-row admin-data-row-trashed">
                    <strong>{run.score}%</strong>
                    <span>{run.source}</span>
                    <span>{run.passed} passed &middot; {run.roundsPlayed} levels</span>
                    <em className="admin-trash-flag">
                      Trashed{run.trashedAt ? ` ${formatAgo(run.trashedAt)}` : ''}
                    </em>
                    <button
                      type="button"
                      className="secondary-button small-button"
                      onClick={() => handleUntrash(run)}
                      disabled={busyRunId === run.id}
                    >
                      {busyRunId === run.id ? 'Working...' : 'Put it back'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="admin-account-section admin-danger-zone">
        <h3>Delete this account</h3>
        <p className="settings-hint">
          Removes {account.username} and everything attached: their runs, any
          submissions still in the queue, their sessions, the data mirrored above
          and any login code. This cannot be undone.
        </p>
        <label className="admin-note">
          Type {account.username} to confirm
          <input
            value={deleteConfirm}
            onChange={(event) => setDeleteConfirm(event.target.value)}
            autoComplete="off"
            spellCheck="false"
          />
        </label>
        <div className="action-row">
          <button
            type="button"
            className="secondary-button"
            onClick={handleDelete}
            disabled={!canDelete || isWorking}
          >
            Delete {account.username}
          </button>
        </div>
      </div>
    </>
  )
}

/**
 * The accounts tab: search every account, open one, and act on it.
 *
 * The list is a server search rather than a client filter, because the accounts
 * live in the Worker's database and the panel never holds the whole table.
 */
export default function AccountsTab({ passcode, redeemUrl }) {
  const [query, setQuery] = useState('')
  const [accounts, setAccounts] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showLog, setShowLog] = useState(false)
  // Bumped after a delete or an issue, so the list and the log both re-read.
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const handle = setTimeout(() => {
      setIsLoading(true)
      setError('')
      searchAccounts(passcode, query, controller.signal)
        .then(setAccounts)
        .catch((caught) => {
          if (caught?.name !== 'AbortError') setError(caught?.message ?? 'Could not search accounts.')
        })
        .finally(() => setIsLoading(false))
    }, query ? 200 : 0)

    // Debounced, so typing does not fire a request per keystroke against a
    // database that has to search it.
    return () => {
      clearTimeout(handle)
      controller.abort()
    }
  }, [passcode, query, revision])

  const openAccount = (account) => {
    setSelectedId(account.id)
    setShowLog(false)
  }

  if (showLog) {
    return (
      <>
        <div className="admin-detail-head">
          <button type="button" className="lb-back" onClick={() => setShowLog(false)}>
            &larr; Accounts
          </button>
          <div className="lb-detail-title">
            <strong>Activity log</strong>
            <span>What has been done from this panel</span>
          </div>
        </div>
        <AuditLog passcode={passcode} />
      </>
    )
  }

  if (selectedId) {
    return (
      <AccountDetail
        passcode={passcode}
        accountId={selectedId}
        onBack={() => setSelectedId(null)}
        onChanged={() => setRevision((value) => value + 1)}
      />
    )
  }

  return (
    <div className="admin-accounts">
      <label className="admin-search">
        Search accounts
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Username or display name"
          autoComplete="off"
        />
      </label>

      {error && <div className="validation-message">{error}</div>}

      {isLoading && accounts.length === 0 ? (
        <p className="global-board-message">Loading...</p>
      ) : accounts.length === 0 ? (
        <p className="global-board-message">
          {query ? `No account matches "${query}".` : 'No accounts yet.'}
        </p>
      ) : (
        <div className="admin-account-list">
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              className="admin-account-row"
              onClick={() => openAccount(account)}
            >
              <strong>{account.displayName || account.username}</strong>
              <span className="admin-account-username">@{account.username}</span>
              <span className="admin-account-stats">
                {/* Live runs, for the same reason as the detail panel's headline:
                    a trashed run is not a run on the account any more. */}
                {account.visibleRunCount} runs · {account.submissionCount} submitted
                {account.pendingCount > 0 && ` · ${account.pendingCount} waiting`}
                {account.trashedCount > 0 && ` · ${account.trashedCount} trashed`}
              </span>
              <span className="admin-account-when">
                {account.syncedAt ? `data ${formatAgo(account.syncedAt)}` : 'no data uploaded'}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="action-row">
        <button type="button" className="secondary-button" onClick={() => setShowLog(true)}>
          Activity log
        </button>
      </div>

      {redeemUrl && (
        <p className="settings-hint">
          Issue a code on an account above, then open{' '}
          <a href={redeemUrl} target="_blank" rel="noopener noreferrer">
            the code page
          </a>{' '}
          and paste it in. It opens in a new tab, and redeeming replaces whatever
          session that browser had &mdash; so keep this panel&rsquo;s tab to yourself.
        </p>
      )}
    </div>
  )
}
