import { getSessionUser } from './auth.js'

const SOURCES = new Set([
  'Pointercrate Demon List',
  'AREDL',
  'Global Shitty List',
  'Challenge List',
  'Impossible Levels List',
])
const MAX_LEVELS = 100
const MAX_TIME_LIMIT_MS = 7 * 24 * 60 * 60 * 1000
const SOURCE_HOSTS = {
  'Pointercrate Demon List': ['pointercrate.com', 'youtube.com', 'youtu.be', 'ytimg.com'],
  AREDL: ['aredl.net', 'youtube.com', 'youtu.be', 'ytimg.com'],
  'Global Shitty List': ['globalshittylist.com', 'gdbrowser.com', 'youtube.com', 'youtu.be', 'ytimg.com'],
  'Challenge List': ['challengelist.gd', 'youtube.com', 'youtu.be', 'ytimg.com'],
  'Impossible Levels List': ['impossiblelevels.com', 'youtube.com', 'youtu.be', 'ytimg.com'],
}

const jsonBody = async (request) => {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > 512 * 1024) return null
  try {
    const body = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null
  } catch {
    return null
  }
}

const validTimeLimit = (value) =>
  Number.isInteger(value) && value >= 0 && value <= MAX_TIME_LIMIT_MS

const cleanText = (value, maximum) =>
  typeof value === 'string' ? value.trim().slice(0, maximum) : ''

const cleanUrl = (value, hosts, required = false) => {
  if (value == null || value === '') return required ? null : null
  if (typeof value !== 'string' || value.length > 2048) return null

  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    const allowed = hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))
    if (url.protocol !== 'https:' || !allowed || url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}

const normalizeLevel = (level, source) => {
  if (!level || typeof level !== 'object' || Array.isArray(level)) return null
  const id = cleanText(String(level.id ?? ''), 100)
  const name = cleanText(level.name, 160)
  const creator = cleanText(level.creator, 120)
  const position = level.position

  if (!id || !name || !Number.isInteger(position) || position < 1 || position > 100_000) {
    return null
  }

  const hosts = SOURCE_HOSTS[source]
  const permalink = cleanUrl(level.permalink ?? level.detailUrl, hosts, true)
  if (!permalink) return null

  const thumbnail = level.thumbnail == null
    ? null
    : cleanUrl(level.thumbnail, ['ytimg.com', ...hosts])
  if (level.thumbnail != null && !thumbnail) return null

  const levelId = level.levelId == null ? null : cleanText(String(level.levelId), 32)
  const video = level.video == null ? null : cleanText(level.video, 11)
  if (video && !/^[A-Za-z0-9_-]{11}$/.test(video)) return null

  return {
    id,
    levelId,
    position,
    name,
    creator: creator || 'Unknown creator',
    video,
    thumbnail,
    permalink,
    detailUrl: permalink,
    rate: cleanText(level.rate, 32) || null,
    version: cleanText(level.version, 32) || null,
  }
}

const requireUser = (db, request) => getSessionUser(db, request)

const publicRun = (row) => ({
  id: row.id,
  source: row.source,
  percentStep: row.percent_step,
  allowSkip: Boolean(row.allow_skip),
  levelTimeLimitMs: row.level_time_limit_ms,
  totalTimeLimitMs: row.total_time_limit_ms,
  levelCount: JSON.parse(row.levels_json).length,
  creator: {
    username: row.creator_username,
    displayName: row.creator_display_name,
  },
  createdAt: row.created_at,
})

export const handleCustomRunRoutes = async ({ db, request, key }) => {
  const route = key.replace(/^api\//, '')
  const match = route.match(/^custom-runs(?:\/([a-f0-9-]{36})(?:\/levels\/(\d+))?)?$/i)

  if (!match) return null
  if (!db) return { error: 'This Worker has no database bound.', status: 503 }

  const [, id, levelIndex] = match

  if (request.method === 'POST' && !id) {
    const user = await requireUser(db, request)
    if (!user) return { error: 'Sign in to create a custom run.', status: 401 }

    const body = await jsonBody(request)
    if (!body) return { error: 'Could not read that custom run.', status: 400 }

    const source = cleanText(body.source, 80)
    const percentStep = body.percentStep
    const levels = Array.isArray(body.levels) ? body.levels : null
    if (!SOURCES.has(source)) return { error: 'Choose a supported list source.', status: 400 }
    if (!Number.isInteger(percentStep) || percentStep < 1 || percentStep > 100) {
      return { error: 'The percentage increment must be from 1% to 100%.', status: 400 }
    }
    const maximumLevels = Math.ceil(100 / percentStep)
    if (!levels || levels.length < 1 || levels.length > Math.min(MAX_LEVELS, maximumLevels)) {
      return {
        error: `Add between 1 and ${Math.min(MAX_LEVELS, maximumLevels)} levels for a ${percentStep}% increment.`,
        status: 400,
      }
    }
    if (typeof body.allowSkip !== 'boolean') {
      return { error: 'Choose whether players may skip levels.', status: 400 }
    }
    if (!validTimeLimit(body.levelTimeLimitMs) || !validTimeLimit(body.totalTimeLimitMs)) {
      return { error: 'Time limits must be zero or no more than seven days.', status: 400 }
    }

    const cleanLevels = levels.map((level) => normalizeLevel(level, source))
    if (cleanLevels.some((level) => !level)) {
      return { error: 'One or more levels have invalid list details.', status: 400 }
    }

    const createdAt = Date.now()
    let runId
    for (let attempt = 0; attempt < 3; attempt += 1) {
      runId = crypto.randomUUID()
      try {
        await db
          .prepare(
            `INSERT INTO custom_runs (
               id, creator_user_id, source, percent_step, allow_skip,
               level_time_limit_ms, total_time_limit_ms, levels_json, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            runId,
            user.id,
            source,
            percentStep,
            body.allowSkip ? 1 : 0,
            body.levelTimeLimitMs,
            body.totalTimeLimitMs,
            JSON.stringify(cleanLevels),
            createdAt,
          )
          .run()
        break
      } catch (error) {
        if (!String(error?.message ?? '').includes('UNIQUE') || attempt === 2) throw error
        runId = null
      }
    }

    if (!runId) return { error: 'Could not create the custom run. Try again.', status: 500 }
    return { status: 201, body: { id: runId } }
  }

  if (request.method !== 'GET' || !id) return null

  const row = await db
    .prepare(
      `SELECT c.*, u.username AS creator_username, u.display_name AS creator_display_name
         FROM custom_runs c
         JOIN users u ON u.id = c.creator_user_id
        WHERE c.id = ?`,
    )
    .bind(id)
    .first()
  if (!row) return { error: 'That custom run could not be found.', status: 404 }

  if (levelIndex !== undefined) {
    const index = Number(levelIndex)
    const levels = JSON.parse(row.levels_json)
    if (!Number.isInteger(index) || index < 1 || index > levels.length) {
      return { error: 'That level is not part of this custom run.', status: 404 }
    }
    return { status: 200, body: { level: levels[index - 1] } }
  }

  return { status: 200, body: publicRun(row) }
}
