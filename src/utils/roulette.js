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

export const encodeRunState = (run) => {
  if (!run) return ''
  return toBase64Url(JSON.stringify(run))
}

export const decodeRunState = (encoded) => {
  if (!encoded || typeof encoded !== 'string') {
    return null
  }

  try {
    const parsed = JSON.parse(fromBase64Url(encoded))
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    return parsed
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
  if (typeof encoded !== 'string' || !encoded.startsWith(HISTORY_PREFIX)) {
    return null
  }

  try {
    const parsed = JSON.parse(fromBase64Url(encoded.slice(HISTORY_PREFIX.length)))
    const entries = parsed?.entries
    if (!Array.isArray(entries) || !entries.length) {
      return null
    }
    return entries
  } catch {
    return null
  }
}

export const createRun = ({ startingPercent, levels, source, allowDuplicates, percentStep = 1 }) => {
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

export const createLevelResult = ({ level, targetPercent, achievedPercent, result, startedAt, endedAt = Date.now() }) => {
  const elapsedMs = getElapsedLevelTimeMs({ startedAt, now: endedAt })

  return {
    roundNumber: 0,
    targetPercent,
    achievedPercent,
    result,
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
