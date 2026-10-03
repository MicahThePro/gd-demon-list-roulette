import { normalizePointercrateParts } from '../services/pointercrateParts.js'

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
   rounds plus the time on the level being played right now. */
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

// allowSkip defaults to false, matching the settings default: a run has to
// opt in to skipping rather than out of it. App always passes the player's own
// setting, so this only covers a caller that does not.
export const createRun = ({ startingPercent, levels, source, allowDuplicates, percentStep = 1, allowSkip = false, levelTimeLimitMs = 0, totalTimeLimitMs = 0, pointercrateParts = null }) => {
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
    // Copied onto the run rather than read from settings while it is played.
    // A run started before these settings existed has none of these fields, so
    // each has to be treated as absent rather than assumed.
    allowSkip,
    levelTimeLimitMs,
    totalTimeLimitMs,
    /* Which Pointercrate lists this run was drawn from, or null on every other
     * list.
     *
     * Frozen onto the run alongside the rules, for the same reason: the badge on
     * the leaderboard has to say what the run was actually played from, and a
     * setting read while the result is displayed would report whatever the boxes
     * say now rather than what they said when the run started.
     *
     * Normalized on the way in, so an older run with no such field reports null
     * and simply shows no badge. */
    pointercrateParts: source === 'Pointercrate Demon List' ? normalizePointercrateParts(pointercrateParts) : null,
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
// values are stored in run history and exported leaderboard codes, so they are
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

/* Turns anything into a known reason id, so an unknown value cannot break the
   display. */
export const normalizeSkipReason = (reason) =>
  SKIP_REASON_IDS.has(reason) ? reason : null

export const getSkipReasonLabel = (reason) =>
  SKIP_REASONS.find((entry) => entry.id === reason)?.label ?? 'Skipped'

/* Rolls one recorded reason into a per-reason tally stored on the run. A run
   created before skip reasons were tracked has no tally at all, so the missing
   object is treated as an empty one rather than spread from undefined. */
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
    // leaving the key absent.
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
