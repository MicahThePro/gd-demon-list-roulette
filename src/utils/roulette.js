export const clampPercent = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return 1
  return Math.min(100, Math.max(1, Math.round(number)))
}

// Any whole number from 1 to 100 is a valid step. A step that would push the
// next target past 100 simply lands on 100 instead, so 45 goes 45 -> 90 -> 100.
export const MAX_PERCENT_STEP = 100

export const normalizePercentStep = (value) => {
  const numeric = Math.trunc(Number(value))
  if (!Number.isFinite(numeric)) return 1
  return Math.min(MAX_PERCENT_STEP, Math.max(1, numeric))
}

// Targets are whole numbers only, so the achieved value can never be decimal.
export const getNextTargetPercent = (achievedPercent, step = 1) => {
  const safeStep = normalizePercentStep(step)
  const achieved = clampPercent(achievedPercent)
  return Math.min(100, (Math.floor(achieved / safeStep) + 1) * safeStep)
}

/* Total play time for a run in progress: the time already banked on finished
   rounds plus the time on the level being played right now.

   Deliberately NOT measured from the run's start timestamp. A save code that
   sits in a clipboard overnight, or a tab closed for a few hours, must not
   burn a time limit the player was never actually playing against, and the
   level clock is already rebased on load to pause across such a gap. Summing
   the recorded rounds gives the same answer without that special case. */
export const getRunElapsedMs = ({ rounds = [], currentLevelStartedAt, now = Date.now() } = {}) => {
  const banked = (Array.isArray(rounds) ? rounds : []).reduce(
    (total, round) => (Number.isFinite(round?.elapsedMs) ? total + round.elapsedMs : total),
    0,
  )
  const live = getElapsedLevelTimeMs({ startedAt: currentLevelStartedAt, now })
  return banked + live
}

export const formatDurationMs = (durationMs = 0) => {
  const safeMilliseconds = Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0
  const totalSeconds = Math.floor(safeMilliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return [hours.toString(), minutes.toString().padStart(2, '0'), seconds.toString().padStart(2, '0')].join(':')
  }

  return [minutes.toString().padStart(2, '0'), seconds.toString().padStart(2, '0')].join(':')
}

export const getElapsedLevelTimeMs = ({ startedAt, currentLevelStartedAt, now = Date.now() } = {}) => {
  const effectiveStartedAt = Number.isFinite(startedAt)
    ? startedAt
    : Number.isFinite(currentLevelStartedAt)
      ? currentLevelStartedAt
      : null

  if (!Number.isFinite(effectiveStartedAt)) {
    return 0
  }

  return Math.max(0, now - effectiveStartedAt)
}

const toBase64Url = (value) => {
  const encoded = btoa(unescape(encodeURIComponent(value)))
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const fromBase64Url = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return decodeURIComponent(escape(atob(padded)))
}

/* Codes are long -- a full 100 level run is around 20 KB on one line -- so a
   copy almost never arrives intact. A textarea, a phone keyboard, or any chat
   app will have wrapped it, and a trailing newline comes with almost every
   paste. atob then fails on a character it should never have been given, and
   the code is reported as invalid even though the person copied it perfectly.
   Every space is therefore removed before decoding, not just the ends: the
   wrap can land anywhere along the line. */
const stripWhitespace = (value) => value.replace(/\s+/g, '')

// Prefixed and versioned like the leaderboard code, for the same reason: a bare
// base64 blob can be re-encoded by hand into any run anyone likes, and a code
// that carries no type marker cannot tell a run save from a history export. The
// "1" is the format version, so a future change can be detected rather than
// parsed as garbage.
const RUN_PREFIX = 'GDLRS1:'
// The prefix used before the site was renamed to GD List Roulette. Kept in the
// known list so codes people already saved with it still load, but the app
// only ever writes the current prefix.
const LEGACY_RUN_PREFIX = 'DLRS1:'
const KNOWN_RUN_PREFIXES = [RUN_PREFIX, LEGACY_RUN_PREFIX]

/**
 * Encodes the in-progress run into a portable string.
 *
 * The "1" in the prefix is a format version, not an integrity guarantee. Codes
 * are share codes, not proof of play: anyone can hand-edit the payload before it
 * is re-encoded, so loading a code means trusting whoever shared it.
 */
export const encodeRunState = (run) => {
  if (!run) return ''
  return RUN_PREFIX + toBase64Url(JSON.stringify({ v: 1, run }))
}

export const decodeRunState = (encoded) => {
  if (!encoded || typeof encoded !== 'string') {
    return null
  }

  // Whitespace is stripped first, so a wrapped or newline-terminated paste is
  // read the same as an untouched one. See stripWhitespace.
  const cleaned = stripWhitespace(encoded)

  // Codes shared before the prefix existed are still accepted, since people have
  // those in their clipboard history, but the app never produces one any more.
  const prefix = KNOWN_RUN_PREFIXES.find((candidate) => cleaned.startsWith(candidate))
  const payload = prefix ? cleaned.slice(prefix.length) : cleaned
  const isLegacy = !prefix

  try {
    const parsed = JSON.parse(fromBase64Url(payload))
    const run = isLegacy ? parsed : parsed?.run
    if (!run || typeof run !== 'object' || !Number.isFinite(Number(run.currentTarget))) {
      return null
    }
    return run
  } catch {
    return null
  }
}

// Prefixed so a history code can never be mistaken for a run save code, and so
// a future format change can be detected instead of being parsed as garbage.
// The "1" is the format version.
const HISTORY_PREFIX = 'DLRH1:'

/**
 * Encodes the whole leaderboard into a portable string.
 *
 * Every stored field travels, including each level's id, name, target and
 * achieved percentages, result, time and thumbnail. Nothing is summarised or
 * dropped, so an imported history renders exactly like the exported one.
 */
export const encodeHistory = (entries) => {
  if (!Array.isArray(entries) || !entries.length) {
    return ''
  }
  return HISTORY_PREFIX + toBase64Url(JSON.stringify({ v: 1, entries }))
}

export const decodeHistory = (encoded) => {
  if (typeof encoded !== 'string') {
    return null
  }

  // Whitespace is stripped first, so a wrapped or newline-terminated paste is
  // read the same as an untouched one. See stripWhitespace.
  const cleaned = stripWhitespace(encoded)
  if (!cleaned.startsWith(HISTORY_PREFIX)) {
    return null
  }

  try {
    const parsed = JSON.parse(fromBase64Url(cleaned.slice(HISTORY_PREFIX.length)))
    const entries = parsed?.entries
    if (!Array.isArray(entries) || !entries.length) {
      return null
    }
    return entries
  } catch {
    return null
  }
}

// allowSkip defaults to false, matching the settings default: a run has to
// opt in to skipping rather than out of it. App always passes the player's own
// setting, so this only covers a caller that does not.
export const createRun = ({ startingPercent, levels, source, allowDuplicates, percentStep = 1, allowSkip = false, levelTimeLimitMs = 0, totalTimeLimitMs = 0 }) => {
  const safeStep = normalizePercentStep(percentStep)
  const seedStart = clampPercent(Math.max(safeStep, startingPercent ?? safeStep))
  const currentLevel = pickNextLevel(levels, [], allowDuplicates)
  const startedAt = Date.now()

  return {
    runId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    currentTarget: seedStart,
    startingPercent: seedStart,
    percentStep: safeStep,
    status: 'active',
    source,
    allowDuplicates,
    levels,
    usedLevelIds: currentLevel ? [currentLevel.id] : [],
    currentLevel,
    currentLevelStartedAt: startedAt,
    rounds: [],
    endingPercent: seedStart,
    skippedCount: 0,
    skipReasons: {},
    // Copied onto the run rather than read from settings while it is played, so
    // a save code carries the rules it was started under. A run started before
    // these settings existed has none of these fields, so each has to be treated
    // as absent rather than assumed, which is why the reads below default them.
    allowSkip,
    levelTimeLimitMs,
    totalTimeLimitMs,
    // The clock the total limit counts down from. Separate from startedAt, which
    // is the run's own start and is also written into every history entry.
    rulesStartedAt: startedAt,
  }
}

export const pickNextLevel = (levels = [], usedLevelIds = [], allowDuplicates = false) => {
  const safeLevels = Array.isArray(levels) ? levels.filter((level) => level && level.id != null) : []
  if (!safeLevels.length) {
    return null
  }

  if (allowDuplicates) {
    return safeLevels[Math.floor(Math.random() * safeLevels.length)]
  }

  const uniquePool = safeLevels.filter((level) => !usedLevelIds.includes(level.id))

  if (uniquePool.length > 0) {
    return uniquePool[Math.floor(Math.random() * uniquePool.length)]
  }

  const repeatPool = safeLevels.filter((level) => usedLevelIds.includes(level.id))
  return repeatPool.length ? repeatPool[Math.floor(Math.random() * repeatPool.length)] : safeLevels[0]
}

// Why a level was skipped. A skip used to be anonymous, so a run full of them
// gave no clue whether the player was being careful or just rage-quitting. The
// values are stored in save codes and exported leaderboard codes, so they are
// treated as a fixed vocabulary: a new value can be added, but changing one
// would orphan the reasons already in people's histories.
export const SKIP_REASONS = [
  { id: 'too-hard', label: 'Too hard' },
  { id: 'bad-luck', label: 'Bad luck' },
  { id: 'unfair', label: 'Unfair / glitched' },
  { id: 'no-time', label: 'No time' },
  { id: 'not-feeling-it', label: 'Not feeling it' },
]
const SKIP_REASON_IDS = new Set(SKIP_REASONS.map((reason) => reason.id))
export const DEFAULT_SKIP_REASON = 'too-hard'

/* Turns anything into a known reason id, so a hand-edited save code carrying a
   reason this version has never heard of cannot break the display. */
export const normalizeSkipReason = (reason) =>
  SKIP_REASON_IDS.has(reason) ? reason : null

export const getSkipReasonLabel = (reason) =>
  SKIP_REASONS.find((entry) => entry.id === reason)?.label ?? 'Skipped'

/* Rolls one recorded reason into a per-reason tally stored on the run. An
   existing run loaded from an older save code has no tally at all, so the
   missing object is treated as an empty one rather than spread from undefined. */
export const countSkipReason = (tally, reason) => {
  const valid = normalizeSkipReason(reason)
  if (!valid) return tally && typeof tally === 'object' ? tally : {}

  const counts = tally && typeof tally === 'object' ? tally : {}
  return { ...counts, [valid]: (counts[valid] ?? 0) + 1 }
}

export const createLevelResult = ({ level, targetPercent, achievedPercent, result, startedAt, endedAt = Date.now(), skipReason = null }) => {
  const elapsedMs = getElapsedLevelTimeMs({ startedAt, now: endedAt })

  return {
    roundNumber: 0,
    targetPercent,
    achievedPercent,
    result,
    // Only meaningful on a skip, so every other result stores null rather than
    // leaving the key absent. A save code round-trip then round-trips exactly.
    skipReason: result === 'skipped' ? normalizeSkipReason(skipReason) : null,
    level,
    startedAt,
    endedAt,
    elapsedMs,
    elapsedLabel: formatDurationMs(elapsedMs),
  }
}

export const summarizeResult = (run) => {
  if (!run) return 'No run in progress.'

  if (run.status === 'completed') {
    return 'You cleared the roulette and reached 100%.'
  }

  if (run.status === 'failed') {
    return `You failed the ${run.currentTarget}% target and the run ended.`
  }

  return `Current target: ${run.currentTarget}%`
}
