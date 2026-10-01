import { useMemo, useState } from 'react'
import { unpackRound, MAX_ENTRIES } from '../hooks/useRunHistory'
import { formatDurationMs, getSkipReasonLabel, SKIP_REASONS } from '../utils/roulette'
import { SUBMITTABLE_SOURCES } from '../services/apiService'
import { submitEntry } from '../services/submissionService'
import { hasSubmitted } from '../utils/submittedRuns'
import SubmitRunForm from './SubmitRunForm'

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
  // A round the clock ran out on, rather than one the player ended.
  timeout: 'Timed out',
}

const formatWhen = (timestamp) => {
  if (!Number.isFinite(timestamp)) return 'Unknown date'

  const date = new Date(timestamp)
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const sameYear = date.getFullYear() === new Date().getFullYear()

  // The time is always shown next to the date: a leaderboard is read as
  // "how far and how fast", and "12:04 PM" alone loses the day it happened on.
  return `${date.toLocaleDateString(undefined, {
    year: sameYear ? undefined : 'numeric',
    month: 'short',
    day: 'numeric',
  })} · ${time}`
}

const RunDetail = ({ entry, onClose, onDelete, auth }) => {
  const totalTime = entry.totalMs ? formatDurationMs(entry.totalMs) : '--:--'
  const avgTime = entry.avgMs ? formatDurationMs(entry.avgMs) : '--:--'
  // Re-read whenever the entry or the user changes, so signing in or submitting
  // swaps the form's state without the detail view having to be reopened.
  const [isSubmitted, setIsSubmitted] = useState(() => hasSubmitted(entry.id))
  // A run on a list the Worker does not rank cannot be sent, so the form says
  // why rather than offering a button that would be refused.
  const isSubmittable = SUBMITTABLE_SOURCES.includes(entry.source)

  // Only the reasons actually used, in the fixed vocabulary order, so the
  // breakdown lines up between runs instead of shuffling per run. An entry
  // recorded before reasons existed has no tally, hence the empty default.
  const skipBreakdown = SKIP_REASONS
    .map((reason) => ({ ...reason, count: entry.skipReasons?.[reason.id] ?? 0 }))
    .filter((reason) => reason.count > 0)

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

      {/* The whole section is omitted rather than shown as an empty block, since
          a run with no skips and a run recorded before reasons existed both
          have nothing to say here. */}
      {skipBreakdown.length > 0 && (
        <div className="skip-breakdown">
          <p className="results-section-label">Why levels were skipped</p>
          <div className="skip-reason-chips">
            {skipBreakdown.map((reason) => (
              <span key={reason.id} className="skip-reason-chip">
                {reason.label}
                <span className="skip-reason-chip-count">{reason.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

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
                      : round.result === 'timeout'
                        ? `Ran out of time at ${round.target}%`
                        : round.result === 'skipped'
                          ? `Skipped${round.skipReason ? ` • ${getSkipReasonLabel(round.skipReason)}` : ''}`
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

      {/* The same form the results screen offers, so a run that is already
          finished with can be sent to the global leaderboard later without
          replaying it. `getPayload` posts this entry rather than a live run,
          which is the only thing the two entry points do differently. */}
      <p className="results-section-label">Global leaderboard</p>
      <div className="submit-panel">
        <SubmitRunForm
          auth={auth}
          isSubmittable={isSubmittable}
          alreadySubmitted={isSubmitted}
          runKey={entry.id}
          getPayload={() => submitEntry(entry)}
          onSubmitted={() => setIsSubmitted(true)}
          intro={
            <>
              Submit this run to the global leaderboard as{' '}
              <strong>@{auth?.user?.username}</strong>, using the link to a video of it.
            </>
          }
        />
      </div>
    </div>
  )
}

/* Succeeded runs have a single natural order (the levels you cleared), so they
   get no filters. Gave-up and failed runs have several comparable numbers, so
   those tabs can be sorted. */
const SORT_FILTERS = [
  { key: 'score', label: 'Highest %', compare: (a, b) => b.score - a.score },
  { key: 'levels', label: 'Most levels', compare: (a, b) => b.roundsPlayed - a.roundsPlayed },
  { key: 'newest', label: 'Newest', compare: (a, b) => b.at - a.at },
]
const FILTERS = {
  gaveup: SORT_FILTERS,
  failed: SORT_FILTERS,
}

/* Succeeded runs have a single natural order (the levels you cleared), so they
   get no filters. Gave-up runs have several comparable numbers, so that tab can
   be sorted. Failed runs are the same shape and sort with them.

   Three tabs, not two, and that is the point: a run that misses its target is a
   real run the player played and the board has a row for it -- it is on their
   account, it counts in the badge, and it can be submitted. A two-tab board had
   no home for it, so a failed run was counted in the "N runs stored" total and
   in the badge but appeared nowhere, with no row and therefore no way to delete
   it. The tabs are built to cover every entry rather than to divide the
   interesting ones, so the tab counts always add up to the total. */
const TABS = [
  { key: 'cleared', label: 'Succeeded', statuses: ['completed'], filters: [] },
  { key: 'gaveup', label: 'Gave up', statuses: ['gaveup'], filters: FILTERS.gaveup },
  { key: 'failed', label: 'Failed', statuses: ['failed'], filters: FILTERS.failed },
]

const EMPTY_TAB_MESSAGES = {
  cleared: 'No cleared runs yet. Hit a 100% level to make this list.',
  gaveup: 'No runs given up yet.',
  failed: 'No failed runs yet. Missing a target ends a run, and that is recorded here.',
}

export default function Leaderboard({ entries, onDelete, onClear, auth }) {
  const [tab, setTab] = useState('cleared')
  const [filter, setFilter] = useState(FILTERS.gaveup[0].key)
  const [openId, setOpenId] = useState(null)

  const tabs = useMemo(() => {
    const built = TABS.map((definition) => ({
      ...definition,
      items: entries.filter((e) => definition.statuses.includes(e.status)),
    }))
    /* Anything the tabs above do not claim, so no run can be counted but invisible.
       A status written by a newer version of the site would otherwise land here:
       it is real data the player can see the total of, so it is listed rather than
       swallowed. Nothing produces one today, which is exactly why it is worth
       rendering rather than trusting the list above to stay complete. */
    const claimed = new Set(TABS.flatMap((t) => t.statuses))
    const unlisted = entries.filter((entry) => !claimed.has(entry.status))
    if (unlisted.length) {
      built.push({
        key: 'other',
        label: 'Other',
        items: unlisted,
        filters: SORT_FILTERS,
        isFallback: true,
      })
    }
    return built
  }, [entries])

  const activeTab = tabs.find((t) => t.key === tab) ?? tabs[0]
  const activeFilters = activeTab?.filters ?? []
  const activeFilter =
    activeFilters.find((f) => f.key === filter) ?? activeFilters[0] ?? null
  // Sorting a device-local list of runs is cheap, so it just happens per render
  // instead of through a memo that would depend on a fresh object each time.
  const visibleItems = activeFilter
    ? [...activeTab.items].sort(activeFilter.compare)
    : activeTab.items
  const openEntry = openId ? entries.find((entry) => entry.id === openId) : null

  if (openEntry) {
    return (
      <div className="lb-detail-wrap">
        <RunDetail entry={openEntry} onClose={() => setOpenId(null)} onDelete={onDelete} auth={auth} />
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

      {activeFilters.length > 0 && activeTab.items.length > 0 && (
        <div className="lb-filters" role="group" aria-label="Sort runs">
          {activeFilters.map((f) => (
            <button
              key={f.key}
              type="button"
              className={f.key === activeFilter?.key ? 'lb-filter lb-filter-active' : 'lb-filter'}
              aria-pressed={f.key === activeFilter?.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {activeTab.items.length === 0 ? (
        <p className="lb-empty">
          {entries.length === 0
            ? 'No runs yet. Hit a 100% level to make this list, or sign in to pick up the runs saved on your account.'
            : (EMPTY_TAB_MESSAGES[activeTab.key] ?? 'Nothing in this list yet.')}
        </p>
      ) : (
        <div className="lb-list">
          {visibleItems.map((entry, index) => (
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

      {/* No export and no import: a signed-in account is where runs are kept now,
          so moving to another device is a matter of signing in rather than of
          copying a code between browsers. Clear stays, because it is about this
          board rather than about moving it. */}
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
