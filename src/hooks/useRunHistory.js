import { useCallback, useEffect, useState } from 'react'
import { getElapsedLevelTimeMs } from '../utils/roulette'

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
//   [id, name, target, achieved, result, ms, video]
const ROUND_FIELDS = ['id', 'name', 'target', 'achieved', 'result', 'ms', 'video']
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
]
const packGaveUpRound = ({ level, target, ms }) => [
  level?.id ?? null,
  level?.name ?? 'Unknown level',
  target ?? null,
  null,
  'gaveup',
  Number.isFinite(ms) ? ms : null,
  level?.video ?? null,
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

  // Two writes with different jobs. The mirror keeps every level so an export
  // can be complete; the cookie is trimmed to fit and is what survives if
  // localStorage is ever cleared.
  useEffect(() => {
    writeMirror(entries)
    writeCookie(STORAGE_KEY, JSON.stringify(fitCookieLimit(entries)))
  }, [entries])

  const recordRun = useCallback((runState, endedAt = Date.now()) => {
    if (!runState) return

    setEntries((current) => {
      const next = [summarizeRun(runState, endedAt), ...current]
        .sort(compareEntries)
        .slice(0, MAX_ENTRIES)

      return fitCookieLimit(next)
    })
  }, [])

  const deleteEntry = useCallback((id) => {
    setEntries((current) => current.filter((entry) => entry.id !== id))
  }, [])

  const clearHistory = useCallback(() => {
    setEntries([])
  }, [])

  // Merges imported entries into the existing history. Entries are matched on
  // id, and `at` is part of that id, so re-importing the same code is a no-op
  // rather than a way to flood the leaderboard with duplicates.
  const importEntries = useCallback((incoming) => {
    if (!Array.isArray(incoming) || !incoming.length) {
      return { added: 0, skipped: 0, total: incoming?.length ?? 0 }
    }

    const valid = incoming.filter(isValidEntry)
    let added = 0
    let skipped = 0

    setEntries((current) => {
      const seen = new Set(current.map((entry) => entry.id))
      const merged = [...current]

      for (const entry of valid) {
        if (seen.has(entry.id)) {
          skipped += 1
          continue
        }
        seen.add(entry.id)
        merged.push(entry)
        added += 1
      }

      return merged.sort(compareEntries).slice(0, MAX_ENTRIES)
    })

    return { added, skipped, total: incoming.length }
  }, [])

  const bestScore = entries.length ? Math.max(...entries.map((entry) => entry.score)) : 0
  const completedCount = entries.filter((entry) => entry.status === 'completed').length

  return {
    entries,
    recordRun,
    deleteEntry,
    clearHistory,
    importEntries,
    bestScore,
    completedCount,
  }
}
