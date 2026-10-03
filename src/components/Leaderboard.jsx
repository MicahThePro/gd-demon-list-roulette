import { useEffect, useMemo, useState } from 'react'
import { unpackRound, MAX_ENTRIES } from '../hooks/useRunHistory'
import { formatDurationMs, getSkipReasonLabel, SKIP_REASONS } from '../utils/roulette'
import { SUBMITTABLE_SOURCES } from '../services/apiService'
import { LIST_SOURCES, LIST_SOURCE_LABELS } from '../services/listService'
import { censorText } from '../utils/censor'
import { submitEntry } from '../services/submissionService'
import { hasSubmitted } from '../utils/submittedRuns'
import PointercratePartsBadge from './PointercratePartsBadge'
import { POINTERCRATE_PARTS, pointercratePartsLabel } from '../services/pointercrateParts.js'
import SubmitRunForm from './SubmitRunForm'

const POINTERCRATE_SOURCE = 'Pointercrate Demon List'

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

const RunDetail = ({ entry, onClose, onRequestDelete, auth }) => {
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
          <strong>{censorText(entry.source)}</strong>
          <span>
            {formatWhen(entry.at)} &middot; step +{entry.step}% &middot; {entry.roundsPlayed} levels
          </span>
          {/* Repeated here as well as on the row, because the detail view is where
              somebody goes to check exactly what a run was played from. */}
          <PointercratePartsBadge parts={entry.pointercrateParts} />
        </div>
        <button
          type="button"
          className="lb-delete"
          onClick={() => {
            onRequestDelete(entry)
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
                  <strong title={censorText(round.name)}>{censorText(round.name)}</strong>
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

const SOURCES = [
  { id: 'all', label: 'All lists' },
  ...Object.values(LIST_SOURCES).map((name) => ({
    id: name,
    label: censorText(LIST_SOURCE_LABELS[name] ?? name),
  })),
]

const EMPTY_TAB_MESSAGES = {
  cleared: 'No cleared runs yet. Hit a 100% level to make this list.',
  gaveup: 'No runs given up yet.',
  failed: 'No failed runs yet. Missing a target ends a run, and that is recorded here.',
}

export default function Leaderboard({ entries, onDelete, auth }) {
  const [tab, setTab] = useState('cleared')
  const [filter, setFilter] = useState(FILTERS.gaveup[0].key)
  const [source, setSource] = useState('all')
  /* Which Pointercrate list to narrow to, on any of the tabs.
   *
   * Local to this device and not a run rule, so unlike the sort filters it is not
   * per-tab: a player asking "show me the Legacy runs I did" wants that answer
   * whichever tab they are on. */
  const [parts, setParts] = useState('')
  const [openId, setOpenId] = useState(null)
  /* The run a delete is about to happen to, held until the player confirms.
   *
   * Only ever set for a run that is on the global leaderboard. Deleting an
   * ordinary run has nothing to warn about, so it stays a single click -- a
   * confirmation on every delete would train people to click through the one
   * that matters. */
  const [pendingDeleteId, setPendingDeleteId] = useState(null)

  const filteredEntries = source === 'all' ? entries : entries.filter((entry) => entry.source === source)

  const tabs = useMemo(() => {
    const built = TABS.map((definition) => ({
      ...definition,
      items: filteredEntries.filter((e) => definition.statuses.includes(e.status)),
    }))
    /* Anything the tabs above do not claim, so no run can be counted but invisible.
       A status written by a newer version of the site would otherwise land here:
       it is real data the player can see the total of, so it is listed rather than
       swallowed. Nothing produces one today, which is exactly why it is worth
       rendering rather than trusting the list above to stay complete. */
    const claimed = new Set(TABS.flatMap((t) => t.statuses))
    const unlisted = filteredEntries.filter((entry) => !claimed.has(entry.status))
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
  }, [filteredEntries])

  const activeTab = tabs.find((t) => t.key === tab) ?? tabs[0]
  const activeFilters = activeTab?.filters ?? []
  const activeFilter =
    activeFilters.find((f) => f.key === filter) ?? activeFilters[0] ?? null
  const handleSourceChange = (value) => {
    setSource(value)
    setParts('')
  }

  /* Narrowed after the tabs are built, so the tab counts keep reporting what is
   * actually on the board rather than what the filter happens to be showing. A
   * count that changed with the filter would make the tab totals stop adding up
   * to the number of runs, which is the check the tabs exist to guarantee. */
  const partItems = activeTab.items.filter((entry) =>
    parts
      ? entry.source === POINTERCRATE_SOURCE &&
        Array.isArray(entry.pointercrateParts) &&
        entry.pointercrateParts.includes(parts)
      : true,
  )

  // Sorting a device-local list of runs is cheap, so it just happens per render
  // instead of through a memo that would depend on a fresh object each time.
  const visibleItems = activeFilter
    ? [...partItems].sort(activeFilter.compare)
    : partItems

  /* The Pointercrate part filter is a source filter, not a run-existence check.
   * If the user selects Pointercrate in the dropdown they should get the same
   * sub-list controls even when their account currently has zero Pointercrate
   * runs saved on-device. */
  const showPointercrateParts = source === LIST_SOURCES.POINTERCRATE
  const openEntry = openId ? entries.find((entry) => entry.id === openId) : null

  /* The delete goes through this rather than straight to onDelete.
   *
   * A ranked run is one whose entry says so, which the server decides by the same
   * approved-submission rule the board itself uses. The delete cascade takes the
   * submission with it, so the run leaves the public board permanently and cannot
   * be resubmitted -- that is worth one interruption. */
  const requestDelete = (entry) => {
    if (entry.onGlobalBoard) {
      setPendingDeleteId(entry.id)
      return
    }
    onDelete(entry.id)
  }

  const confirmDelete = () => {
    if (!pendingDeleteId) return
    onDelete(pendingDeleteId)
    setPendingDeleteId(null)
    // The run it belonged to is gone, so its detail view has to close rather than
    // sit there describing a row that is no longer on the board.
    setOpenId((current) => (current === pendingDeleteId ? null : current))
  }

  const pendingEntry = pendingDeleteId ? entries.find((entry) => entry.id === pendingDeleteId) : null

  /* Escape backs out of the warning, as it backs out of the quit dialog. A click
   * on the backdrop does the same. */
  useEffect(() => {
    if (!pendingDeleteId) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setPendingDeleteId(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pendingDeleteId])

  if (openEntry) {
    return (
      <div className="lb-detail-wrap">
        <RunDetail entry={openEntry} onClose={() => setOpenId(null)} onRequestDelete={requestDelete} auth={auth} />
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

      <label className="global-board-source">
        <span className="visually-hidden">Filter by list</span>
        <select value={source} onChange={(event) => handleSourceChange(event.target.value)}>
          {SOURCES.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>

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

      {showPointercrateParts && (
        /* Its own class rather than a second `.lb-filters`: the grid has one
           `filters` area, and two children in one named area are placed into the
           same cell, which painted these chips on top of the sort chips. */
        <div className="lb-part-filters" role="group" aria-label="Filter by Pointercrate list">
          <button
            type="button"
            className={parts === '' ? 'lb-filter lb-filter-active' : 'lb-filter'}
            aria-pressed={parts === ''}
            onClick={() => setParts('')}
          >
            All lists
          </button>
          {POINTERCRATE_PARTS.map((part) => (
            <button
              key={part.id}
              type="button"
              className={parts === part.id ? 'lb-filter lb-filter-active' : 'lb-filter'}
              aria-pressed={parts === part.id}
              onClick={() => setParts(parts === part.id ? '' : part.id)}
            >
              {part.label} only
            </button>
          ))}
        </div>
      )}

      {partItems.length === 0 ? (
        <p className="lb-empty">
          {/* A filter that emptied the board needs a different sentence from a tab
              that was already empty. "No cleared runs yet" would be a claim about
              the account that is simply false -- there are cleared runs, they are
              just not the ones being asked for. */}
          {parts
            ? `No ${POINTERCRATE_PARTS.find((p) => p.id === parts)?.label ?? parts} runs on this tab.`
            : entries.length === 0
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
                  {censorText(entry.source)} &middot; step +{entry.step}% &middot; {entry.roundsPlayed} levels
                  {/* The parts, inline rather than as a pill in the top row: this
                      sub-line is already the "what was this run" line, and a pill
                      above it would pull the eye away from the score. */}
                  {pointercratePartsLabel(entry.pointercrateParts) &&
                    ` · Pointercrate ${pointercratePartsLabel(entry.pointercrateParts)}`}
                  {entry.passed > 0 && ` · ${entry.passed} passed`}
                  {entry.skipped > 0 && ` · ${entry.skipped} skipped`}
                  {entry.avgMs ? ` · avg ${formatDurationMs(entry.avgMs)}` : ''}
                </span>
                <span className="lb-when">{formatWhen(entry.at)}</span>
              </button>
              <button
                type="button"
                className="lb-delete"
                onClick={() => requestDelete(entry)}
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
          copying a code between browsers.

          No "clear all" either. It was the one control on this board that could
          destroy something the player could not get back, and it did so in a
          single click with no confirmation -- including runs that were ranked on
          the global leaderboard, where the delete takes the submission with it
          and the run cannot be resubmitted. Every run has its own delete, and a
          ranked one now warns first, so removing runs is still possible; it just
          cannot happen by accident. */}
      {pendingEntry && (
        <div
          className="modal-backdrop"
          onClick={() => setPendingDeleteId(null)}
          role="presentation"
        >
          {/* role="dialog" with aria-modal marks this as a real dialog for
              assistive tech, and the click on the inner box is stopped so
              clicking inside it does not dismiss. */}
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-ranked-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-ranked-title">Remove this run from the leaderboard?</h2>
            <p>
              This run is on the global leaderboard. Deleting it removes it from
              there as well as from your own board, and it cannot be put back or
              submitted again.
            </p>
            <div className="modal-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setPendingDeleteId(null)}
                autoFocus
              >
                Keep the run
              </button>
              <button
                className="danger-button"
                type="button"
                onClick={confirmDelete}
              >
                Delete from leaderboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
