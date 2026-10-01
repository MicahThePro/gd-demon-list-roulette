import { useCallback, useEffect, useRef, useState } from 'react'
import { getElapsedLevelTimeMs, normalizeSkipReason } from '../utils/roulette'
import { clearBoard, deleteEntryFromBoard } from './boardDeletion'

const STORAGE_KEY = 'demon-roulette-history'
// Full-fidelity mirror of the history. The cookie is trimmed to fit its ~4 KB
// budget, so reading state from the cookie alone would permanently lose level
// detail and an exported code could not carry everything. The mirror is
// unbounded in the way a cookie is not, so export and import work off it.
const MIRROR_KEY = 'demon-roulette-history-full'
// A cookie caps out around 4 KB, so the history is kept deliberately small.
// Each entry holds only what the leaderboard needs, not the full run.
export const MAX_ENTRIES = 20

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

const readCookie = (name) => {
  if (typeof document === 'undefined') return null

  const prefix = `${encodeURIComponent(name)}=`
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))

  return match ? decodeURIComponent(match.slice(prefix.length)) : null
}

const writeCookie = (name, value) => {
  if (typeof document === 'undefined') return

  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
}

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

const readMirror = () => {
  if (typeof localStorage === 'undefined') return []

  try {
    const parsed = JSON.parse(localStorage.getItem(MIRROR_KEY))
    return Array.isArray(parsed) ? parsed.filter(isValidEntry) : []
  } catch {
    return []
  }
}

const writeMirror = (entries) => {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(entries))
  } catch {
    // A full mirror can be large, and localStorage is capped too. Losing the
    // mirror only costs export fidelity; the cookie below is still written.
  }
}

const readHistory = () => {
  // The mirror is preferred because it holds every level, while the cookie has
  // had detail shed to fit. A first-time visitor has neither.
  const mirrored = readMirror()
  if (mirrored.length) {
    return mirrored
  }

  const raw = readCookie(STORAGE_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isEntryLike) : []
  } catch {
    return []
  }
}

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

// A cookie caps out near 4 KB, so the history is trimmed to fit. Round detail
// is shed evenly across every entry, best run included, because one 100 level
// run on its own already exceeds the budget. Only once there is no detail left
// to lose does the oldest entry get dropped.
const fitCookieLimit = (entries) => {
  const budget = 3600
  if (JSON.stringify(entries).length <= budget) {
    return entries
  }

  // Shed rounds from every entry, longest first, until it fits. A single 100
  // level run on its own exceeds the budget, so this has to go all the way
  // down rather than stopping early.
  for (const keep of [25, 20, 15, 10, 8, 6, 5, 4, 3, 2, 1]) {
    const trimmed = entries.map((entry) => ({ ...entry, rounds: entry.rounds.slice(0, keep) }))
    if (JSON.stringify(trimmed).length <= budget) {
      return trimmed
    }
  }

  // Still too big, so drop the oldest entries as well. Entries are already
  // sorted best first, so the newest and strongest survive longest.
  for (const keep of [10, 5, 3, 1]) {
    const shortened = entries.map((entry) => ({ ...entry, rounds: entry.rounds.slice(0, keep) }))
    let count = shortened.length
    while (count > 1 && JSON.stringify(shortened.slice(0, count)).length > budget) {
      count -= 1
    }
    if (JSON.stringify(shortened.slice(0, count)).length <= budget) {
      return shortened.slice(0, count)
    }
  }

  return []
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

export const useRunHistory = () => {
  const [entries, setEntries] = useState(readHistory)
  /* Previewing somebody else's account.
   *
   * The board on screen belongs to whoever is signed in, and during a preview that
   * is not the person whose browser this is. Three things had to change together,
   * because each one alone leaves the wrong runs on screen:
   *
   * 1. The account's runs replace the local ones rather than merging with them. A
   *    merge showed the moderator's own runs under the previewed account's name --
   *    and an account with no runs at all showed the moderator's, which reads as
   *    though the previewed account had played them.
   * 2. The local runs are kept aside rather than overwritten. They live in this
   *    browser's storage, so replacing them on screen without setting them aside
   *    would destroy the moderator's own history the moment a preview ended.
   * 3. Nothing is written to storage during a preview. A run played while
   *    previewing belongs to the previewed account and belongs on their account,
   *    not in this browser's history, and the results screen offers to save it
   *    there. Writing it locally would put somebody else's run into the
   *    moderator's own board on the next sign in. */
  const localBackup = useRef(null)
  const [isPreviewing, setIsPreviewing] = useState(false)

  /* The current board, readable from a callback that does not want to depend on it.
   *
   * Deleting has to read the entry it is deleting -- to find whether the server
   * knows it, and under which id -- before it removes it, and by then the
   * setEntries updater that holds the list has already been handed its work. A
   * callback that took `entries` would rebuild on every recorded run and make
   * every row in the board a new function; a ref is written during render and
   * read afterwards, which is the one case a ref is for. */
  const entriesRef = useRef(entries)
  entriesRef.current = entries

  const beginPreview = useCallback(() => {
    setEntries((current) => {
      // Set aside once, so a preview started from inside another preview does not
      // overwrite the real backup with the first previewed account's runs.
      if (localBackup.current === null) {
        localBackup.current = current
      }
      return []
    })
    setIsPreviewing(true)
  }, [])

  const endPreview = useCallback(() => {
    const own = localBackup.current
    localBackup.current = null
    setEntries(own ?? readHistory())
    setIsPreviewing(false)
  }, [])

  // Two writes with different jobs. The mirror keeps every level so an export
  // can be complete; the cookie is trimmed to fit and is what survives if
  // localStorage is ever cleared.
  useEffect(() => {
    // Skipped wholesale during a preview: what is on screen is the previewed
    // account's runs, and persisting those into this browser's history would hand
    // them back to the moderator the moment the preview ended.
    if (isPreviewing) return
    writeMirror(entries)
    writeCookie(STORAGE_KEY, JSON.stringify(fitCookieLimit(entries)))
  }, [entries, isPreviewing])

  const recordRun = useCallback((runState, endedAt = Date.now()) => {
    if (!runState) return

    setEntries((current) => {
      const next = [summarizeRun(runState, endedAt), ...current]
        .sort(compareEntries)
        .slice(0, MAX_ENTRIES)

      return fitCookieLimit(next)
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

  const clearHistory = useCallback(async ({ onServerError } = {}) => {
    const { survivors, error } = await clearBoard(entriesRef.current)
    if (survivors.length) {
      // Put back exactly what could not be deleted, so the board agrees with the
      // account rather than looking emptier than it is.
      setEntries((current) => {
        const kept = new Set(current.map((entry) => entry.id))
        return [...survivors.filter((entry) => kept.has(entry.id)), ...current]
      })
      onServerError?.(error)
      return
    }
    setEntries([])
  }, [])

  /* Replaces the local board with the account's runs, and hides the ones a
     moderator has trashed.

     A signed-in player's leaderboard is the account's, not the device's: signing
     in on another device brings the same board, and signing out of an account
     leaves that device's own runs alone rather than mixing the two. The
     replacement rather than a merge is the point -- a run that was trashed and
     deleted on one device must not survive on another.

     Server entries are merged in place of local ones by id, so a run played
     here and synced there keeps one row. `trashedRunKeys` comes back as keys
     rather than entries, and a trashed run is also removed from the local copy:
     a run hidden on the account is hidden here, whether or not this device was
     the one that recorded it.

     `replace` is for a preview, and is the one case where merging would be wrong.
     Merging a previewed account's runs into this browser's runs shows the
     moderator's own runs labelled with somebody else's name, and an account with
     no runs at all shows the moderator's, which is the opposite of what a preview
     is for. The previewed account's board is exactly what the account holds. */
  const applyAccountEntries = useCallback(
    ({ entries: incoming = [], trashedRunKeys = [], replace = false } = {}) => {
      const hidden = new Set(trashedRunKeys)

      setEntries((current) => {
        const merged = replace
          ? new Map()
          : new Map(current.map((entry) => [entry.id, entry]))
        for (const entry of incoming) {
          if (!isValidEntry(entry) || hidden.has(entry.id)) continue
          merged.set(entry.id, entry)
        }
        return [...merged.values()]
          .filter((entry) => !hidden.has(entry.id))
          .sort(compareEntries)
          .slice(0, MAX_ENTRIES)
      })
    },
    [],
  )

  /** Locally hides every run the account reports as trashed, without a re-read
   *  of the whole account. Used right after a moderator's action changes things
   *  and the server already told us which runs are affected. */
  const hideEntries = useCallback((ids) => {
    const hidden = new Set(ids)
    if (!hidden.size) return
    setEntries((current) => current.filter((entry) => !hidden.has(entry.id)))
  }, [])

  const bestScore = entries.length ? Math.max(...entries.map((entry) => entry.score)) : 0
  const completedCount = entries.filter((entry) => entry.status === 'completed').length

  return {
    entries,
    isPreviewing,
    beginPreview,
    endPreview,
    recordRun,
    deleteEntry,
    clearHistory,
    applyAccountEntries,
    hideEntries,
    bestScore,
    completedCount,
  }
}
