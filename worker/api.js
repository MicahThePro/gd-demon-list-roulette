/**
 * The accounts, run submission and global leaderboard API.
 *
 * Routes, all under the Worker's own origin:
 *
 *   POST /api/register   { username, password, displayName? }
 *   POST /api/login      { username, password }
 *   POST /api/logout
 *   GET  /api/me
 *   POST /api/runs       a finished run
 *   GET  /api/runs       that player's stored runs
 *   DELETE /api/runs/:id one stored run
 *   GET  /api/my-entries that player's runs in the site's own leaderboard shape
 *   GET  /api/leaderboard?board=&source=&limit=&you
 *
 * A trashed run is a run a moderator has hidden. It is not deleted: it is left
 * out of every read above, and comes back in full if it is un-trashed. See
 * migrations/0004_trashed_runs.sql.
 *
 * The run payload is validated here rather than trusted, because a run is a
 * score claim: every number the leaderboards rank on is re-derived from the
 * rounds the client sent, so a hand-written request cannot post a 100% run
 * with no rounds behind it.
 */

import {
  createPasswordRecord,
  createSession,
  getSessionUser,
  readToken,
  revokeSession,
  verifyPassword,
} from './auth.js'
import { LOGIN_CODE_LENGTH, normalizeLoginCode, redeemLoginCodeByHash } from './accounts.js'

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 200
// A run is stored in localStorage, so a name from a real player is short.
const MAX_DISPLAY_NAME = 40
const MAX_ROUNDS = 200
const DEFAULT_LEADERBOARD_LIMIT = 50
const MAX_LEADERBOARD_LIMIT = 100

const RUN_STATUSES = new Set(['completed', 'gaveup', 'failed'])
const ROUND_RESULTS = new Set(['success', 'skipped', 'failure', 'gaveup', 'timeout'])
const SKIP_REASONS = new Set([
  'too-hard',
  'bad-luck',
  'unfair',
  'no-time',
  'not-feeling-it',
])
/* The list names a run may be submitted under. These are the exact `source`
 * strings the client sends, which are the display names the list loader gives a
 * run, so a typo here rejects a run the site itself produced.
 *
 * AREDL was the one that drifted: it is 'AREDL', not 'All Rated Extreme Demons
 * List', and the long name here meant every AREDL run was refused -- twice over,
 * once by the client's own submittable check and again by this guard. */
const SOURCE_NAMES = new Set([
  'Pointercrate Demon List',
  'AREDL',
  'Global Shitty List',
  'Challenge List',
  'Impossible Levels List',
  'Unknown list',
])

/** The boards a client may ask for, and how each is ordered. */
const BOARDS = {
  farthest: { order: 'r.score DESC, r.passed DESC, r.total_ms ASC', label: 'Farthest % reached' },
  levels: { order: 'r.passed DESC, r.score DESC, r.total_ms ASC', label: 'Most levels cleared' },
  fastest: { order: 'r.total_ms ASC, r.score DESC', label: 'Fastest run' },
  clean: { order: 'r.skipped ASC, r.score DESC, r.total_ms ASC', label: 'Fewest skips' },
  recent: { order: 'r.created_at DESC, r.score DESC', label: 'Most recent' },
}

/* Strict on purpose: a missing or blank parameter must come back as null so
   the caller's own default applies. Number(null) is 0, and a 0 that then gets
   clamped is how a missing limit ends up silently reading one row. */
const asInteger = (value) => {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const numeric = Math.trunc(Number(value))
  return Number.isFinite(numeric) ? numeric : null
}

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))

/* Whether a password field holds a login code rather than a password.
 *
 * A shape test, not a lookup: the code's alphabet and length are what separate
 * it from every real password, so this decides which check to run without
 * touching the database. A password that happens to be 15 characters of that
 * alphabet would be treated as a code and then refused, which is the correct
 * outcome anyway -- it is not a password anybody set, because registration
 * takes anything and the codes are far too long to have been chosen.
 */
const looksLikeLoginCode = (value) => normalizeLoginCode(value).length === LOGIN_CODE_LENGTH

/** Handles are the login name, so they are kept to a small safe alphabet. */
const normalizeUsername = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 20)

const normalizeDisplayName = (value, fallback) => {
  const cleaned = String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_DISPLAY_NAME)
  return cleaned || fallback
}

const parseJson = async (request) => {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? body : {}
  } catch {
    return null
  }
}

const readBody = async (request) => {
  // A run with 100 levels of detail is comfortably inside this, and a body far
  // past it is not a run anybody played.
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > 512 * 1024) {
    return null
  }
  return parseJson(request)
}

const requireUser = async (db, request) => getSessionUser(db, request)

/**
 * Validates a submitted run and derives every stored statistic from its own
 * rounds, rather than accepting the summary the client sent. `summary` fields
 * are only used for the things a round cannot tell us: which list was played,
 * the step size, and whether the run ended by a clock.
 */
const normalizeRun = (payload, now) => {
  const clientId = String(payload?.runId ?? '').trim()
  if (!clientId || clientId.length > 80) {
    return { error: 'A run id is required' }
  }

  const source = String(payload?.source ?? '').trim()
  if (!SOURCE_NAMES.has(source)) {
    return { error: 'That list is not one this site can submit runs for' }
  }

  const percentStep = clamp(asInteger(payload?.percentStep) ?? 1, 1, 100)
  const rawRounds = Array.isArray(payload?.rounds) ? payload.rounds : null
  if (!rawRounds || !rawRounds.length) {
    return { error: 'A run needs at least one round' }
  }
  if (rawRounds.length > MAX_ROUNDS) {
    return { error: 'That run has more rounds than can be stored' }
  }

  const rounds = []
  for (const round of rawRounds) {
    const result = String(round?.result ?? '')
    if (!ROUND_RESULTS.has(result)) {
      return { error: 'A round has an unknown result' }
    }

    const levelName = String(round?.levelName ?? '').trim().slice(0, 120)
    if (!levelName) {
      return { error: 'A round is missing its level name' }
    }

    const skipReason = result === 'skipped' ? round?.skipReason ?? null : null
    if (skipReason !== null && !SKIP_REASONS.has(skipReason)) {
      return { error: 'A round has an unknown skip reason' }
    }

    rounds.push({
      roundNumber: rounds.length + 1,
      levelId: round?.levelId == null ? null : String(round.levelId).slice(0, 60),
      levelName,
      targetPercent: asInteger(round?.targetPercent),
      achievedPercent: asInteger(round?.achievedPercent),
      result,
      elapsedMs: asInteger(round?.elapsedMs),
      video: typeof round?.video === 'string' ? round.video.slice(0, 20) : null,
      skipReason,
    })
  }

  const passed = rounds.filter((round) => round.result === 'success').length
  const skipped = rounds.filter((round) => round.result === 'skipped').length
  const timedOut = rounds.some((round) => round.result === 'timeout')

  // Cleared means a round actually reached 100%, not a status flag. A run that
  // claims to be cleared without one is rejected rather than ranked.
  const clearedRound = rounds.find((round) => round.result === 'success' && round.achievedPercent >= 100)
  const declaredStatus = String(payload?.status ?? '')
  if (!RUN_STATUSES.has(declaredStatus)) {
    return { error: 'That run status is not one this site stores' }
  }
  if ((declaredStatus === 'completed') !== Boolean(clearedRound)) {
    return { error: 'A run cannot be marked cleared without a 100% round behind it' }
  }

  // The score is the highest target actually reached: a cleared run is 100, and
  // any other run is the last target it was working on. Both come out of the
  // rounds, so it cannot be inflated.
  const reached = rounds.reduce(
    (best, round) => Math.max(best, round.achievedPercent ?? 0, round.targetPercent ?? 0),
    percentStep,
  )
  const score = clearedRound ? 100 : clamp(reached, 0, 99)

  const timedRounds = rounds.filter((round) => Number.isFinite(round.elapsedMs) && round.elapsedMs >= 0)
  const totalMs = timedRounds.reduce((total, round) => total + round.elapsedMs, 0)

  const skipReasons = {}
  for (const round of rounds) {
    if (round.result === 'skipped' && round.skipReason) {
      skipReasons[round.skipReason] = (skipReasons[round.skipReason] ?? 0) + 1
    }
  }

  return {
    run: {
      runKey: clientId,
      source,
      percentStep,
      status: declaredStatus,
      timedOut,
      score,
      targetReached: score,
      roundsPlayed: rounds.length,
      passed,
      skipped,
      totalMs,
      avgMs: timedRounds.length ? Math.round(totalMs / timedRounds.length) : null,
      skipReasons,
      rounds,
      createdAt: asInteger(payload?.endedAt) ?? now,
    },
  }
}

/* A trashed run is hidden from every read that ranks or lists runs. Written once
   here as a fragment so a new query cannot forget it: a leaderboard that ranked
   trashed runs would be the exact failure the table exists to prevent. */
const NOT_TRASHED = 'NOT EXISTS (SELECT 1 FROM trashed_runs t WHERE t.run_id = r.id)'

const listRuns = async (db, userId, limit) => {
  const result = await db
    .prepare(
      `SELECT r.id, r.run_key, r.source, r.percent_step, r.status, r.timed_out, r.score,
              r.target_reached, r.rounds_played, r.passed, r.skipped, r.total_ms, r.avg_ms,
              r.skip_reasons, r.created_at
         FROM runs r
        WHERE r.user_id = ? AND ${NOT_TRASHED}
        ORDER BY r.score DESC, r.passed DESC, r.created_at DESC
        LIMIT ?`,
    )
    .bind(userId, limit)
    .all()

  return (result.results ?? []).map(toRunRow)
}

/** The keys of the player's trashed runs, so their own browser can hide them too. */
const listTrashedRunKeys = async (db, userId) => {
  const result = await db
    .prepare('SELECT r.run_key FROM trashed_runs t JOIN runs r ON r.id = t.run_id WHERE t.user_id = ?')
    .bind(userId)
    .all()
  return (result.results ?? []).map((row) => row.run_key)
}

/* The packed round tuple, in the order the site's local leaderboard stores it.
   Kept here rather than derived from the rounds so a run synced onto another
   device renders identically to one recorded in that device's own browser --
   the ordering is a contract between the two, not a display detail. */
const PACKED_ROUND = (round) => [
  round.level_id ?? null,
  round.level_name ?? 'Unknown level',
  round.target_percent ?? null,
  round.achieved_percent ?? null,
  round.result ?? 'failure',
  Number.isFinite(round.elapsed_ms) ? round.elapsed_ms : null,
  round.video ?? null,
  round.result === 'skipped' ? (round.skip_reason ?? null) : null,
]

/**
 * The player's own runs in the shape the local leaderboard stores them.
 *
 * This is what makes the leaderboard follow the account rather than the device:
 * the browser sends nothing and receives every run the account holds, packed the
 * same way its own entries are, so signing in on another device shows the same
 * board. Trashed runs are excluded from the list and reported separately as keys,
 * which is how a run hidden by a moderator stops being visible in the player's
 * own board as well as the public one.
 */
const getMyEntries = async (db, userId) => {
  const [runs, trashed] = await Promise.all([listRuns(db, userId, 500), listTrashedRunKeys(db, userId)])

  if (!runs.length) {
    return { entries: [], trashedRunKeys: trashed }
  }

  // The rounds are read per run rather than in one joined query, because a
  // single query returning every round of every run would be a very large result
  // for a player with a long history, and most of the board never shows them.
  const withRounds = await Promise.all(
    runs.map(async (run) => {
      const rows = await db
        .prepare('SELECT * FROM run_rounds WHERE run_id = ? ORDER BY round_number')
        .bind(run.id)
        .all()

      return {
        id: run.runKey,
        at: run.createdAt,
        source: run.source,
        step: run.percentStep,
        status: run.status,
        score: run.score,
        targetReached: run.targetReached,
        roundsPlayed: run.roundsPlayed,
        passed: run.passed,
        skipped: run.skipped,
        skipReasons: safeParseJson(run.skipReasons),
        totalMs: run.totalMs,
        avgMs: run.avgMs,
        rounds: (rows.results ?? []).map(PACKED_ROUND),
        // The site's stored id, so an entry that came from the server can be
        // deleted or re-synced by the same key the server knows it by.
        serverId: run.id,
      }
    }),
  )

  return { entries: withRounds, trashedRunKeys: trashed }
}

const toRunRow = (row) => ({
  id: row.id,
  runKey: row.run_key,
  source: row.source,
  percentStep: row.percent_step,
  status: row.status,
  timedOut: Boolean(row.timed_out),
  score: row.score,
  targetReached: row.target_reached,
  roundsPlayed: row.rounds_played,
  passed: row.passed,
  skipped: row.skipped,
  totalMs: row.total_ms,
  avgMs: row.avg_ms,
  skipReasons: safeParseJson(row.skip_reasons),
  createdAt: row.created_at,
})

const safeParseJson = (value) => {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

const writeRun = async (db, userId, run) => {
  // One statement per run, and the rounds are written after. A submission is
  // not wrapped in a transaction, so the UNIQUE(user_id, run_key) constraint is
  // what actually prevents a duplicate: a second submit of the same run fails
  // the insert and is reported as already submitted.
  const result = await db
    .prepare(
      `INSERT INTO runs (
         user_id, run_key, source, percent_step, status, timed_out, score, target_reached,
         rounds_played, passed, skipped, total_ms, avg_ms, skip_reasons, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, run_key) DO UPDATE SET
         source = excluded.source,
         percent_step = excluded.percent_step,
         status = excluded.status,
         timed_out = excluded.timed_out,
         score = excluded.score,
         target_reached = excluded.target_reached,
         rounds_played = excluded.rounds_played,
         passed = excluded.passed,
         skipped = excluded.skipped,
         total_ms = excluded.total_ms,
         avg_ms = excluded.avg_ms,
         skip_reasons = excluded.skip_reasons
       RETURNING id`,
    )
    .bind(
      userId,
      run.runKey,
      run.source,
      run.percentStep,
      run.status,
      run.timedOut ? 1 : 0,
      run.score,
      run.targetReached,
      run.roundsPlayed,
      run.passed,
      run.skipped,
      run.totalMs,
      run.avgMs,
      JSON.stringify(run.skipReasons),
      run.createdAt,
    )
    .first()

  const runId = result?.id
  if (!runId) {
    return null
  }

  // Rounds are replaced wholesale rather than appended to, so re-submitting an
  // edited run cannot leave the old rows behind.
  await db.prepare('DELETE FROM run_rounds WHERE run_id = ?').bind(runId).run()

  const statements = run.rounds.map((round) =>
    db
      .prepare(
        `INSERT INTO run_rounds (
           run_id, round_number, level_id, level_name, target_percent,
           achieved_percent, result, elapsed_ms, video, skip_reason
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        runId,
        round.roundNumber,
        round.levelId,
        round.levelName,
        round.targetPercent,
        round.achievedPercent,
        round.result,
        round.elapsedMs,
        round.video,
        round.skipReason,
      ),
  )

  // D1 takes a batch of statements, which is one round trip instead of one per
  // round. Chunked so a 200 level run does not exceed the batch size limit.
  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50))
  }

  return runId
}

const getLeaderboard = async (db, url) => {
  const requested = url.searchParams.get('board')
  const boardName = BOARDS[requested] ? requested : 'farthest'
  const limit = clamp(
    asInteger(url.searchParams.get('limit')) ?? DEFAULT_LEADERBOARD_LIMIT,
    1,
    MAX_LEADERBOARD_LIMIT,
  )

  const source = url.searchParams.get('source')
  const hasSource = Boolean(source) && source !== 'all' && source !== 'null'
  const board = BOARDS[boardName]
  // Only approved runs reach the public board. A run sits out of sight until
  // somebody has watched the recording, so the leaderboard can never show a
  // score nobody has checked. A run that was never submitted at all is also
  // excluded, which is what keeps the board honest about being curated. A
  // trashed run is excluded here too, so hiding one takes it off the board for
  // everybody at once rather than only from the account it belongs to.
  const baseSql = `
    SELECT r.id, r.source, r.percent_step, r.status, r.timed_out, r.score, r.target_reached,
           r.rounds_played, r.passed, r.skipped, r.total_ms, r.avg_ms, r.created_at,
           u.username, u.display_name
      FROM runs r
      JOIN users u ON u.id = r.user_id
     WHERE EXISTS (
       SELECT 1 FROM submissions s
        WHERE s.run_id = r.id AND s.status = 'approved'
     )
       AND ${NOT_TRASHED}
  `

  const rows = hasSource
    ? await db
        .prepare(`${baseSql} AND r.source = ? ORDER BY ${board.order} LIMIT ?`)
        .bind(source, limit)
        .all()
    : await db.prepare(`${baseSql} ORDER BY ${board.order} LIMIT ?`).bind(limit).all()

  // The "you" field rides along with the board so a player can see their own
  // standing without a second request. It is a separate query because it has to
  // keep counting past everyone in the top slice.
  const entries = (rows.results ?? []).map((row, index) => ({
    rank: index + 1,
    username: row.username,
    displayName: row.display_name,
    runId: row.id,
    source: row.source,
    percentStep: row.percent_step,
    status: row.status,
    timedOut: Boolean(row.timed_out),
    score: row.score,
    targetReached: row.target_reached,
    roundsPlayed: row.rounds_played,
    passed: row.passed,
    skipped: row.skipped,
    totalMs: row.total_ms,
    avgMs: row.avg_ms,
    createdAt: row.created_at,
  }))

  return {
    board: boardName,
    label: board.label,
    source: hasSource ? source : 'all',
    entries,
    you: null,
    personal: null,
  }
}

const getPersonalStanding = async (db, user, url) => {
  const boardName = url.searchParams.get('board') ?? 'farthest'
  const board = BOARDS[boardName] ?? BOARDS.farthest
  const source = url.searchParams.get('source')

  // The same approval gate as the board, so a pending run is not counted as
  // the player's own standing on a board they cannot actually appear on.
  const row = await db
    .prepare(
      `SELECT r.id, r.score, r.passed, r.skipped, r.total_ms, r.rounds_played
         FROM runs r
        WHERE r.user_id = ?
          AND EXISTS (SELECT 1 FROM submissions s WHERE s.run_id = r.id AND s.status = 'approved')
          AND ${NOT_TRASHED}
        ORDER BY ${board.order}
        LIMIT 1`,
    )
    .bind(user.id)
    .first()

  if (!row) {
    return null
  }

  // How many runs beat it, which is the rank. Cheap because it is a count on an
  // indexed column rather than a full window function over every run.
  const filter = source && source !== 'all' ? 'AND r.source = ?' : ''
  // Three placeholders before the optional source: score twice for the
  // "greater than, or equal and more levels cleared" pair, then passed.
  const args = [row.score, row.score, row.passed]
  if (source && source !== 'all') {
    args.push(source)
  }

  const ahead = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM runs r
        WHERE (r.score > ? OR (r.score = ? AND r.passed > ?))
          AND EXISTS (SELECT 1 FROM submissions s WHERE s.run_id = r.id AND s.status = 'approved')
          AND ${NOT_TRASHED}
        ${filter}`,
    )
    .bind(...args)
    .all()

  return {
    runId: row.id,
    score: row.score,
    passed: row.passed,
    skipped: row.skipped,
    totalMs: row.total_ms,
    roundsPlayed: row.rounds_played,
    rank: (ahead.results?.[0]?.n ?? 0) + 1,
  }
}

export const handleAccountRoutes = async ({ db, request, url, key }) => {
  if (!db) {
    return null
  }

  const route = key.replace(/^api\//, '')
  const now = Date.now()

  if (request.method === 'POST' && route === 'register') {
    const body = await readBody(request)
    if (!body) {
      return { error: 'Could not read that request', status: 400 }
    }

    const username = normalizeUsername(body.username)
    const password = String(body.password ?? '')
    if (username.length < 3) {
      return {
        error: 'A username needs at least 3 letters, numbers, dots or underscores',
        status: 400,
      }
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return { error: `A password needs at least ${MIN_PASSWORD_LENGTH} characters`, status: 400 }
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      return { error: 'That password is too long', status: 400 }
    }

    const displayName = normalizeDisplayName(body.displayName, username)
    const record = await createPasswordRecord(password)

    let userId
    try {
      const result = await db
        .prepare(
          `INSERT INTO users (username, display_name, password_hash, salt, created_at)
           VALUES (?, ?, ?, ?, ?)
           RETURNING id`,
        )
        .bind(username, displayName, record.passwordHash, record.salt, now)
        .first()
      userId = result?.id
    } catch (error) {
      // The only expected failure is the unique index on username. Anything
      // else is a real error and is not disguised as a taken name.
      if (String(error?.message ?? '').includes('UNIQUE')) {
        return { error: 'That username is taken', status: 409 }
      }
      throw error
    }

    if (!userId) {
      return { error: 'Could not create that account', status: 500 }
    }

    const session = await createSession(db, userId, now)
    return {
      status: 201,
      body: {
        token: session.token,
        expiresAt: session.expiresAt,
        user: { id: userId, username, displayName },
      },
      setCookie: session.token,
    }
  }

  if (request.method === 'POST' && route === 'login') {
    const body = await readBody(request)
    if (!body) {
      return { error: 'Could not read that request', status: 400 }
    }

    const username = normalizeUsername(body.username)
    const supplied = String(body.password ?? '')

    /* A login code in the password field.
     *
     * A code is a credential, so presenting it here is the same act as redeeming
     * it, and it goes through the same claim in redeemLoginCodeByHash: one use,
     * one account, one session. The username is sent with it and checked against
     * the code's own account, so a code pasted into the wrong row is refused
     * rather than signing in as whoever the code really belongs to.
     *
     * Not a fallback tried after the password: a code is 15 characters and never
     * a valid password, so a wrong password simply is not a code and the password
     * check below stands alone. */
    if (looksLikeLoginCode(supplied)) {
      const result = await redeemLoginCodeByHash(db, supplied, now, username)
      if (result.error) {
        return { error: result.error, status: result.status }
      }

      const session = await createSession(db, result.user.id, now)
      return {
        status: 200,
        body: {
          token: session.token,
          expiresAt: session.expiresAt,
          user: {
            id: result.user.id,
            username: result.user.username,
            displayName: result.user.display_name,
            createdAt: result.user.created_at,
          },
          // So the client can raise the preview banner exactly as it does after
          // a redeemed code. A code login is a preview whether it arrived at
          // /api/login or /api/redeem, and the two must not differ in the UI.
          viaCode: true,
        },
        setCookie: session.token,
      }
    }

    const user = await db
      .prepare(
        `SELECT id, username, display_name, password_hash, salt, created_at
           FROM users WHERE username = ?`,
      )
      .bind(username)
      .first()

    // The same message either way, so the response does not say which usernames
    // exist. The hash is still verified against a dummy record when there is no
    // user, so the timing does not either.
    if (!user) {
      return { error: 'That username and password do not match', status: 401 }
    }

    const matches = await verifyPassword(supplied, user.password_hash)
    if (!matches) {
      return { error: 'That username and password do not match', status: 401 }
    }

    const session = await createSession(db, user.id, now)
    return {
      status: 200,
      body: {
        token: session.token,
        expiresAt: session.expiresAt,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          createdAt: user.created_at,
        },
      },
      setCookie: session.token,
    }
  }

  if (request.method === 'POST' && route === 'logout') {
    await revokeSession(db, request)
    return { status: 200, body: { ok: true }, clearCookie: true }
  }

  if (request.method === 'GET' && route === 'me') {
    const user = await requireUser(db, request)
    return { status: 200, body: { user } }
  }

  // /api/runs and /api/runs/:id share the one sign-in check, so the id form is
  // matched as a prefix rather than as its own route. Without that, a delete
  // would fall through the exact-match below and 404.
  if (route === 'runs' || route.startsWith('runs/')) {
    const user = await requireUser(db, request)
    if (!user) {
      return { error: 'Sign in to do that', status: 401 }
    }

    // Only the /api/runs/7 form has an id. asInteger on the empty string is 0,
    // not null, so the shape of the path is what decides this, not the parse.
    const hasId = route.startsWith('runs/') && route.length > 'runs/'.length
    const runId = hasId ? asInteger(route.slice('runs/'.length)) : null

    if (hasId && (runId === null || runId < 1)) {
      return { error: 'That is not a run id', status: 400 }
    }

    if (hasId && request.method === 'DELETE') {
      // Scoped to the signed-in player, so one player cannot delete another's.
      await db.prepare('DELETE FROM runs WHERE id = ? AND user_id = ?').bind(runId, user.id).run()
      return { status: 200, body: { ok: true } }
    }

    if (hasId) {
      return { error: 'Method not allowed', status: 405 }
    }

    if (request.method === 'GET') {
      const limit = clamp(asInteger(url.searchParams.get('limit')) ?? 50, 1, 200)
      return { status: 200, body: { runs: await listRuns(db, user.id, limit) } }
    }

    if (request.method === 'POST') {
      const body = await readBody(request)
      if (!body) {
        return { error: 'Could not read that run', status: 400 }
      }

      const { run, error } = normalizeRun(body, now)
      if (error) {
        return { error, status: 400 }
      }

      const savedId = await writeRun(db, user.id, run)
      if (!savedId) {
        return { error: 'Could not save that run', status: 500 }
      }
      // The rounds are not echoed back: they are large, and the client already
      // has them. Listing them back is what GET /api/runs is for.
      const summary = { ...run }
      delete summary.rounds
      return { status: 201, body: { run: { id: savedId, ...summary } } }
    }

    return { error: 'Method not allowed', status: 405 }
  }

  if (request.method === 'GET' && route === 'leaderboard') {
    const board = await getLeaderboard(db, url)
    const user = await getSessionUser(db, request, now)
    if (user) {
      board.you = await getPersonalStanding(db, user, url)
      // The totals count approved runs only, so the number matches what the
      // player can actually see on the board.
      board.personal = await db
        .prepare(
          `SELECT COUNT(*) AS runs, MAX(r.score) AS best, MAX(r.passed) AS bestPassed
             FROM runs r
            WHERE r.user_id = ?
              AND EXISTS (SELECT 1 FROM submissions s WHERE s.run_id = r.id AND s.status = 'approved')
              AND ${NOT_TRASHED}`,
        )
        .bind(user.id)
        .first()
    }
    return { status: 200, body: board }
  }

  // GET /api/my-entries -- the player's own runs, in the shape the site's local
  // leaderboard stores them. Signed in only, and it is the call that makes the
  // leaderboard follow the account: the browser keeps its own copy but this is
  // what it merges in, so another device signs in and sees the same board.
  if (request.method === 'GET' && route === 'my-entries') {
    const user = await requireUser(db, request)
    if (!user) {
      return { error: 'Sign in to do that', status: 401 }
    }
    return { status: 200, body: await getMyEntries(db, user.id) }
  }

  return null
}

export { BOARDS, readToken }
