import { useCallback, useEffect, useRef, useState } from 'react'
import { getElapsedLevelTimeMs, normalizeSkipReason } from '../utils/roulette'
import { normalizePointercrateParts } from '../services/pointercrateParts.js'
import { clearBoard, deleteEntryFromBoard } from './boardDeletion'

/* Nothing here is written to a cookie or to localStorage, deliberately.
 *
 * The account is the only place runs are kept. A device-held board looked
 * harmless on a personal browser and was a data leak on a shared one: signing
 * out of one account and into another merged the two boards, so the next
 * account saw runs that belonged to somebody who was not signed in. Keeping
 * runs on the account removes that whole class of bug -- there is no second copy
 * for one account to read out of another account's board. */
export const MAX_ENTRIES = 20

/* Clears the keys earlier versions used to write, once, so they are not left
 * behind holding runs that now belong to an account.
 *
 * They are no longer read, so this is not a correctness requirement -- nothing
 * reads them any more. It is tidiness: a run left in this browser's storage is a
 * copy of somebody's play history that nothing on the site is now responsible for,
 * and on a shared browser whoever opens it next could still get at it with one
 * line of devtools. Removing it means the account is the only place runs are. */
const PURGED_KEYS = [
  'demon-roulette-history',
  'demon-roulette-history-full',
  'demon-roulette-history-unowned',
]
export const purgeLegacyHistoryKeys = () => {
  if (typeof localStorage === 'undefined') return
  for (const key of PURGED_KEYS) {
    try {
      localStorage.removeItem(key)
    } catch {
      // Storage disabled or full. Nothing can be read either, so there is nothing
      // here worth interrupting anybody over.
    }
  }
  if (typeof document === 'undefined') return
  for (const key of PURGED_KEYS) {
    document.cookie = `${encodeURIComponent(key)}=; path=/; max-age=0; samesite=lax`
  }
}

// Unpacks a stored round tuple back into named fields for display, and
// rebuilds the thumbnail from the stored YouTube id.
export const unpackRound = (packed) => {
  const out = { result: 'failure' }
  ROUND_FIELDS.forEach((field, index) => {
    out[field] = packed?.[index] ?? null
  })
  out.thumbnail = out.video ? `https://i.ytimg.com/vi/${out.video}/mqdefault.jpg` : null
  return out
}
const MAX_ROUNDS_KEPT = 100

const isEntryLike = (entry) => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry))

// Every field has to survive validation for an entry to be accepted, otherwise
// a hand-edited or truncated code would import runs that render as blanks.
const REQUIRED_ENTRY_FIELDS = [
  'id',
  'at',
  'source',
  'step',
  'status',
  'score',
  'roundsPlayed',
  'passed',
  'skipped',
  'rounds',
]

export const isValidEntry = (entry) =>
  isEntryLike(entry) &&
  REQUIRED_ENTRY_FIELDS.every((field) => entry[field] != null) &&
  Array.isArray(entry.rounds) &&
  Number.isFinite(Number(entry.at))

// Only the fields the leaderboard and the detail view need, so the cookie
// stays small. Rounds are stored as positional tuples rather than objects,
// because repeating key names for every level roughly triples the size and a
// cookie only holds about 4 KB.
//   [id, name, target, achieved, result, ms, video, skipReason]
const ROUND_FIELDS = ['id', 'name', 'target', 'achieved', 'result', 'ms', 'video', 'skipReason']
// Positions of the fields that are read back off the packed tuples. Summing
// and counting off object properties would silently read undefined here,
// because a packed round is an array, not an object.
const ROUND_RESULT = ROUND_FIELDS.indexOf('result')
const ROUND_MS = ROUND_FIELDS.indexOf('ms')
// Only the YouTube id is stored, never the full image URL: the same thumbnail
// is rebuilt from it on display, and a bare id is around 11 bytes rather than
// the 50 or so a https://i.ytimg.com/... string costs on every single level.
const packRound = (round) => [
  round.level?.id ?? null,
  round.level?.name ?? 'Unknown level',
  round.targetPercent ?? null,
  round.achievedPercent ?? null,
  round.result ?? 'failure',
  Number.isFinite(round.elapsedMs) ? round.elapsedMs : null,
  round.level?.video ?? null,
  round.result === 'skipped' ? normalizeSkipReason(round.skipReason) : null,
]
// A give-up round is appended at the end for the results screen, so it has no
// round object to read a reason off and never has one.
const packGaveUpRound = ({ level, target, ms }) => [
  level?.id ?? null,
  level?.name ?? 'Unknown level',
  target ?? null,
  null,
  'gaveup',
  Number.isFinite(ms) ? ms : null,
  level?.video ?? null,
  null,
]
const summarizeRun = (runState, endedAt) => {
  const rounds = (runState?.rounds ?? []).slice(-MAX_ROUNDS_KEPT).map(packRound)

  const gaveUp = runState?.gaveUp === true
  const completed = runState?.status === 'completed'
  // The final level is appended on the results screen for a give-up, so it is
  // not part of run.rounds and has to be added here.
  const finalLevel = gaveUp ? runState?.currentLevel : null

  if (finalLevel) {
    const startedAt = runState?.currentLevelStartedAt
    rounds.push(
      packGaveUpRound({
        level: finalLevel,
        target: runState?.endingPercent ?? runState?.currentTarget ?? null,
        ms:
          Number.isFinite(startedAt) && Number.isFinite(runState?.gaveUpAt)
            ? getElapsedLevelTimeMs({ startedAt, now: runState.gaveUpAt })
            : null,
      }),
    )
  }

  const timedRounds = rounds.filter((round) => Number.isFinite(round[ROUND_MS]))
  const totalMs = timedRounds.reduce((total, round) => total + round[ROUND_MS], 0)

  // Counted from the packed rounds rather than read off run.skipReasons, so the
  // tally and the per-level rows can never disagree, and so a run recorded by
  // an older version still gets a breakdown from the reasons on its rounds.
  const skipReasonCounts = rounds.reduce((counts, round) => {
    if (round[ROUND_RESULT] !== 'skipped') return counts
    const reason = normalizeSkipReason(round[ROUND_FIELDS.indexOf('skipReason')])
    if (!reason) return counts
    return { ...counts, [reason]: counts[reason] + 1 }
  }, {})

  return {
    id: `${endedAt}-${runState?.source ?? 'run'}`,
    at: endedAt,
    source: runState?.source ?? 'Unknown list',
    step: Number.isFinite(runState?.percentStep) ? runState.percentStep : 1,
    /* Which Pointercrate lists this run was drawn from, or null.
     *
     * One of the few optional fields on an entry, so `isValidEntry` does not
     * require it -- a run saved before the lists existed has no such field and
     * simply shows no badge. Adding it to the required list would have thrown
     * all of those away. */
    pointercrateParts: Array.isArray(runState?.pointercrateParts) && runState.pointercrateParts.length
      ? normalizePointercrateParts(runState.pointercrateParts)
      : null,
    status: completed ? 'completed' : gaveUp ? 'gaveup' : 'failed',
    // The score a run is ranked on: how far it got before ending.
    score: completed ? 100 : (runState?.endingPercent ?? runState?.startingPercent ?? 0),
    targetReached: runState?.endingPercent ?? runState?.startingPercent ?? 0,
    roundsPlayed: rounds.length,
    passed: rounds.filter((round) => round[ROUND_RESULT] === 'success').length,
    skipped: runState?.skippedCount ?? 0,
    skipReasons: skipReasonCounts,
    totalMs,
    avgMs: timedRounds.length ? Math.round(totalMs / timedRounds.length) : null,
    rounds,
  }
}

// Best first: completed runs outrank everything, then the farthest percentage
// reached, then the most levels cleared.
export const compareEntries = (a, b) => {
  if (a.status !== b.status) {
    if (a.status === 'completed') return -1
    if (b.status === 'completed') return 1
  }
  if (b.score !== a.score) return b.score - a.score
  if (b.roundsPlayed !== a.roundsPlayed) return b.roundsPlayed - a.roundsPlayed
  return (a.totalMs || 0) - (b.totalMs || 0)
}

export const useRunHistory = (ownerKey = null) => {
  /* Starts empty and stays empty until the server says otherwise.
   *
   * The board is whatever the signed-in account holds, and a run that ends while
   * signed out is never put on it. There is no device-held copy to read back, so
   * there is nothing a signed-out player's board could hold even if we wanted it
   * to: the results screen is where a run is handed to an account, and until that
   * happens the run is not a run anybody is keeping. */
  const [entries, setEntries] = useState([])
  const [isPreviewing, setIsPreviewing] = useState(false)

  /* Whether the board belongs to an account, read by recordRun through a ref.
   *
   * A ref rather than a parameter because recordRun is called from endRun, which is
   * a useCallback in the app; taking ownerKey as an argument would mean the app had
   * to pass it at every call site, and reading it from a closure would rebuild the
   * callback whenever the account changed. Written in an effect like entriesRef,
   * for the same reason: a ref written during render is a value React can discard
   * under concurrent rendering. */
  const ownerRef = useRef(ownerKey)
  useEffect(() => {
    ownerRef.current = ownerKey
  }, [ownerKey])

  /* The current board, readable from a callback that does not want to depend on it.
   *
   * Deleting has to read the entry it is deleting -- to find whether the server
   * knows it, and under which id -- before it removes it, and by then the
   * setEntries updater that holds the list has already been handed its work. A
   * callback that took `entries` would rebuild on every recorded run and make
   * every row in the board a new function; a ref is written in an effect and read
   * afterwards, which is the one case a ref is for. */
  const entriesRef = useRef(entries)
  /* Written in an effect rather than during render, because a ref written during
   * render is a value React can throw away: under concurrent rendering a render can
   * be started and abandoned, and the write would survive while the state it was
   * describing did not. Both refs are only ever read from callbacks and effects,
   * never during render, so an effect is late enough and correct. */
  useEffect(() => {
    entriesRef.current = entries
  }, [entries])

  /* Emptied the moment the account changes.
   *
   * This is the fix for the reported bug, and it is deliberately the bluntest
   * version of it: signing out of one account and into another used to merge the
   * two boards, so the second account was shown the first one's runs, every one of
   * them belonging to somebody who was not signed in. The board now holds one
   * account's runs and no other account's, and there is no stored copy for a
   * later sign in to bring back. Between accounts, and before the first read
   * lands, it is empty rather than stale -- an empty board for a moment is a far
   * smaller problem than the wrong runs. */
  useEffect(() => {
    setEntries([])
  }, [ownerKey])

  /* Previewing somebody else's account.
   *
   * The board on screen belongs to whoever is signed in, and during a preview that
   * is not the person whose browser this is. The previewed account's runs replace
   * whatever is there rather than merging with it, and the moderator's own board
   * is not restored on screen afterwards -- it is read back from the server, which
   * is the only place it is kept, so there is nothing kept aside to restore. */
  const beginPreview = useCallback(() => {
    setEntries([])
    setIsPreviewing(true)
  }, [])

  const endPreview = useCallback(() => {
    setEntries([])
    setIsPreviewing(false)
  }, [])

  /* Records a run that just ended.
   *
   * Signed out, it records nothing at all. This is the whole point of the rule
   * that a run only saves to an account: a run finished by somebody who is not
   * signed in has no owner to be saved to, and the alternatives were both worse.
   * Keeping it here for the session put it on a board that is now hidden while
   * signed out, so it could never be seen or deleted -- a run that existed,
   * counted towards the best score, and could not be reached. Storing it would put
   * exactly the copy this feature exists to remove back into the browser, where the
   * next person to sign in on a shared machine could read it.
   *
   * So a signed-out run is simply not recorded here. It still exists as the run
   * being played, which the results screen holds and offers to save once there is
   * an account to save it to. See ResultsPage for that question.
   *
   * Signed in, the row added here is provisional: the account's own copy is what
   * the server read returns, and this is what it looks like until that lands. */
  const recordRun = useCallback((runState, endedAt = Date.now()) => {
    if (!runState) return
    if (!ownerRef.current) return

    setEntries((current) => {
      const entry = summarizeRun(runState, endedAt)
      const kept = new Map(current.map((item) => [item.id, item]))
      kept.set(entry.id, entry)
      return [...kept.values()].sort(compareEntries).slice(0, MAX_ENTRIES)
    })
  }, [])

  /* Deletes a run.
   *
   * The server is asked first and the row is dropped only once it has agreed, so a
   * signed-in player's delete survives the periodic re-read of their account rather
   * than being undone by it. See boardDeletion for why the id matters and why a
   * failed delete leaves the run visible. */
  const deleteEntry = useCallback(async (id, { onServerError } = {}) => {
    const target = entriesRef.current.find((entry) => entry.id === id)
    const result = await deleteEntryFromBoard(target)
    if (!result.ok) {
      onServerError?.(result.error)
      return
    }
    setEntries((current) => current.filter((entry) => entry.id !== id))
  }, [])

  /* Clears the board, deleting on the account every run it can.
   *
   * Runs the server does not know about -- played signed out, in this session --
   * have nothing to delete anywhere else, so the row goes. Runs it could not
   * delete are put back, so the board agrees with the account rather than looking
   * emptier than it is. */
  const clearHistory = useCallback(async ({ onServerError } = {}) => {
    const { survivors, error } = await clearBoard(entriesRef.current)
    if (survivors.length) {
      setEntries((current) => {
        const kept = new Set(current.map((entry) => entry.id))
        return [...survivors.filter((entry) => kept.has(entry.id)), ...current]
      })
      onServerError?.(error)
      return
    }
    setEntries([])
  }, [])

  /* Replaces the board with the account's runs, and hides the ones a moderator
     has trashed.
   *
   * A signed-in player's leaderboard is the account's and nothing else: it is
   * replaced rather than merged, so an account with no runs shows an empty board
   * rather than the previous account's, and a run on this device that was never
   * saved to an account is not smuggled onto the next account's board. Runs are
   keyed by the id the server minted, so a run saved and then read back keeps one
   row rather than two. */
  const applyAccountEntries = useCallback(({ entries: incoming = [], trashedRunKeys = [] } = {}) => {
    const hidden = new Set(trashedRunKeys)
    const kept = new Map()
    for (const entry of incoming) {
      if (!isValidEntry(entry) || hidden.has(entry.id)) continue
      kept.set(entry.id, entry)
    }
    setEntries([...kept.values()].sort(compareEntries).slice(0, MAX_ENTRIES))
  }, [])

  /* Signing out empties the board.
   *
   * There is nothing left to put back. The previous behaviour restored this
   * device's stored runs, which is exactly how one account's runs ended up on
   * another account's board on a shared browser; with no stored copy, signing out
   * has nothing to leak and the next sign in brings that account's runs and
   * nobody else's. */
  const restoreLocal = useCallback(() => {
    setEntries([])
  }, [])

  const bestScore = entries.length ? Math.max(...entries.map((entry) => entry.score)) : 0

  return {
    entries,
    /* Whether this board has an account behind it. What the home screen asks
     * before offering a personal board at all: with no account there is nothing
     * the board could be showing, so it is not reachable rather than empty. */
    hasOwner: Boolean(ownerKey),
    isPreviewing,
    beginPreview,
    endPreview,
    recordRun,
    deleteEntry,
    clearHistory,
    applyAccountEntries,
    restoreLocal,
    bestScore,
  }
}
