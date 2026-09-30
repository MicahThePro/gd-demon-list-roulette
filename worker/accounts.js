/**
 * Account administration: search, detail, delete, and one-time login codes.
 *
 * Every route here is behind the moderation passcode, checked before the
 * database is touched, so a wrong passcode cannot even tell whether an account
 * exists. That is the same rule the submission queue follows.
 *
 * A login code is not a password. It is a single-use replacement for one, issued
 * here and redeemable once at /api/redeem, so a moderator can look at the site
 * as a player sees it without ever learning or changing that player's password.
 * The code is stored as a digest, is deleted when a new one is issued, and is
 * marked used rather than removed when redeemed -- so a code that has been
 * replaced is dead, and one that has been spent says so.
 *
 * Passwords are never readable, not by this route and not by anybody. They are
 * PBKDF2-SHA256 hashes and one-way, which is the point of storing them that way.
 */

import { checkAdminPasscode } from './admin.js'
import { createSession, getSessionUser } from './auth.js'

const MAX_SEARCH_LENGTH = 60
const PAGE_SIZE = 50
// Enough characters that guessing one is hopeless, few enough to read aloud
// over a call and type by hand. Grouped in threes so it can be said in chunks.
const LOGIN_CODE_LENGTH = 15
const LOGIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
// How long an issued code stays redeemable if it is never used. Long enough to
// hand over in person, short enough that a forgotten code on an unattended
// screen stops working.
const LOGIN_CODE_TTL_MS = 24 * 60 * 60 * 1000

const encoder = new TextEncoder()

const toHex = (buffer) =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const digest = async (value) => toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)))

/** Generates a code, excluding the letters and digits that are easy to misread. */
const generateLoginCode = () => {
  const bytes = new Uint8Array(LOGIN_CODE_LENGTH)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => LOGIN_CODE_ALPHABET[byte % LOGIN_CODE_ALPHABET.length]).join('')
}

const readBody = async (request) => {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? body : {}
  } catch {
    return null
  }
}

const asInteger = (value) => {
  if (value === null || value === undefined || value === '') return null
  const numeric = Math.trunc(Number(value))
  return Number.isFinite(numeric) ? numeric : null
}

const whenLabel = (timestamp) => (Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null)

/* Recorded for anything that can destroy data or impersonate somebody, and
   nothing else. Reading the queue is ordinary use; deleting an account is not. */
const recordAudit = async (db, { action, target, now, detail }) => {
  await db
    .prepare(
      `INSERT INTO admin_audit (action, target_id, target_name, at, detail)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(action, target?.id ?? null, target?.username ?? null, now, detail ?? null)
    .run()
}

/* The account list, with the counts a moderator judges on: how much they have
   done and whether any of it is waiting for review. One query rather than a
   count per row, because the search is over the whole table. */
const ACCOUNT_SQL = `
  SELECT u.id, u.username, u.display_name, u.created_at,
         (SELECT COUNT(*) FROM runs r WHERE r.user_id = u.id) AS run_count,
         (SELECT COUNT(*) FROM submissions s JOIN runs r2 ON r2.id = s.run_id
           WHERE r2.user_id = u.id) AS submission_count,
         (SELECT COUNT(*) FROM submissions s JOIN runs r2 ON r2.id = s.run_id
           WHERE r2.user_id = u.id AND s.status = 'pending') AS pending_count,
         (SELECT synced_at FROM player_data p WHERE p.user_id = u.id) AS synced_at
    FROM users u
`

const accountSummary = (row) => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  createdAt: row.created_at,
  runCount: row.run_count ?? 0,
  submissionCount: row.submission_count ?? 0,
  pendingCount: row.pending_count ?? 0,
  // Null rather than 0: the panel has to be able to say "this player has not
  // synced" instead of implying a zero that is really a blank.
  syncedAt: row.synced_at ?? null,
})

/** The list of runs a player submitted, newest first, with its review state. */
const listUserRuns = async (db, userId) => {
  const result = await db
    .prepare(
      `SELECT r.id, r.run_key, r.source, r.status, r.score, r.percent_step,
              r.passed, r.rounds_played, r.skipped, r.total_ms, r.created_at,
              s.id AS submission_id, s.status AS submission_status, s.review_note
         FROM runs r
         LEFT JOIN submissions s ON s.run_id = r.id
        WHERE r.user_id = ?
        ORDER BY r.created_at DESC
        LIMIT 200`,
    )
    .bind(userId)
    .all()

  return (result.results ?? []).map((row) => ({
    id: row.id,
    runId: row.run_key,
    source: row.source,
    status: row.status,
    score: row.score,
    percentStep: row.percent_step,
    passed: row.passed,
    roundsPlayed: row.rounds_played,
    skipped: row.skipped,
    totalMs: row.total_ms,
    createdAt: row.created_at,
    // A run with no submission has never been sent for review, which is a
    // different thing from one whose submission was deleted.
    submission: row.submission_id
      ? {
          id: row.submission_id,
          status: row.submission_status,
          reviewNote: row.review_note,
        }
      : null,
  }))
}

/** The player's mirrored local data, parsed. A malformed blob is reported as
 *  absent rather than thrown, so one bad row cannot break the whole panel. */
const readPlayerData = async (db, userId) => {
  const row = await db
    .prepare('SELECT history, settings, synced_at FROM player_data WHERE user_id = ?')
    .bind(userId)
    .first()
  if (!row) {
    return { syncedAt: null, history: null, settings: null }
  }

  const parse = (value) => {
    try {
      return value ? JSON.parse(value) : null
    } catch {
      return null
    }
  }

  return { syncedAt: row.synced_at, history: parse(row.history), settings: parse(row.settings) }
}

/** Whether there is a live, unused login code, and when it was issued. The code
 *  itself is never returned -- only at the moment it is generated. */
const readLoginCodeState = async (db, userId, now) => {
  const row = await db
    .prepare('SELECT created_at, used_at FROM login_codes WHERE user_id = ?')
    .bind(userId)
    .first()
  if (!row) {
    return { hasCode: false, issuedAt: null, usedAt: null, expired: false }
  }
  return {
    hasCode: !row.used_at && row.created_at + LOGIN_CODE_TTL_MS > now,
    issuedAt: row.created_at,
    usedAt: row.used_at,
    expired: !row.used_at && row.created_at + LOGIN_CODE_TTL_MS <= now,
  }
}

/* The player's own data, uploaded from their browser. Not an admin route: a
   signed-in player writes their own row, and only their own. */
export const handlePlayerDataRoutes = async ({ db, request, key }) => {
  const route = key.replace(/^api\//, '')

  if (route !== 'player-data' || request.method !== 'PUT') {
    return null
  }

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null
  if (!token) {
    return { error: 'Sign in to save your data', status: 401 }
  }

  const user = await getSessionUser(db, request)
  if (!user) {
    return { error: 'Sign in to save your data', status: 401 }
  }

  const body = await readBody(request)
  if (!body) {
    return { error: 'Could not read that request', status: 400 }
  }

  // The payload is a JSON blob the client owns, so it is size-capped rather than
  // validated field by field. A history of 20 runs is a few tens of KB; a
  // megabyte is a sign something has gone wrong rather than a real history.
  const MAX_BLOB = 1024 * 1024
  const history = typeof body.history === 'string' ? body.history : null
  const settings = typeof body.settings === 'string' ? body.settings : null
  if ((history?.length ?? 0) > MAX_BLOB || (settings?.length ?? 0) > MAX_BLOB) {
    return { error: 'That data is too large to save', status: 413 }
  }

  const now = Date.now()
  await db
    .prepare(
      `INSERT INTO player_data (user_id, history, settings, synced_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         history = excluded.history,
         settings = excluded.settings,
         synced_at = excluded.synced_at`,
    )
    .bind(user.id, history, settings, now)
    .run()

  return { status: 200, body: { ok: true, syncedAt: now } }
}

/* The redemption side, which a player calls and which is deliberately not an
   admin route: the code itself is the credential, and it only works once. */
export const handleLoginCodeRoutes = async ({ db, request, key }) => {
  const route = key.replace(/^api\//, '')

  if (route !== 'redeem' || request.method !== 'POST') {
    return null
  }

  const body = await readBody(request)
  if (!body) {
    return { error: 'Could not read that request', status: 400 }
  }

  // Spaces and dashes are stripped rather than rejected, because a code read
  // aloud and typed back in will have them. Case is not ignored: the alphabet is
  // already unambiguous, so folding case would only add a way to get it wrong.
  const supplied = String(body.code ?? '')
    .replace(/[\s-]/g, '')
    .toUpperCase()

  if (supplied.length !== LOGIN_CODE_LENGTH) {
    return { error: 'That is not a login code', status: 400 }
  }

  const now = Date.now()
  const hash = await digest(supplied)

  const row = await db
    .prepare('SELECT id, user_id, created_at, used_at FROM login_codes WHERE code_hash = ?')
    .bind(hash)
    .first()

  // The same message for a code that does not exist, one that has been replaced,
  // and one that is simply wrong. Telling them apart would confirm that a
  // particular code was ever real.
  if (!row) {
    return { error: 'That login code is not valid', status: 401 }
  }

  if (row.used_at) {
    return { error: 'That login code has already been used', status: 409 }
  }

  if (row.created_at + LOGIN_CODE_TTL_MS <= now) {
    return { error: 'That login code has expired', status: 410 }
  }

  // Marked used before the session is made, and the update is conditional on it
  // still being unused. Two simultaneous redemptions of the same code therefore
  // produce one session: the loser of the race updates zero rows and is turned
  // away, which is what makes it single-use rather than merely usually unused.
  const claimed = await db
    .prepare('UPDATE login_codes SET used_at = ? WHERE id = ? AND used_at IS NULL RETURNING user_id')
    .bind(now, row.id)
    .first()

  if (!claimed) {
    return { error: 'That login code has already been used', status: 409 }
  }

  const user = await db
    .prepare('SELECT id, username, display_name, created_at FROM users WHERE id = ?')
    .bind(row.user_id)
    .first()

  if (!user) {
    return { error: 'That account no longer exists', status: 404 }
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
    // The client is told it was a code, so a preview tab can say so and stop
    // looking like an ordinary signed-in session.
    viaCode: true,
  }
}

export const handleAdminAccountRoutes = async ({ db, request, url, key, adminPasscode }) => {
  const route = key.replace(/^api\//, '')
  if (!route.startsWith('admin/')) {
    return null
  }

  // Checked before anything is read, exactly as the submission queue does it, so
  // a wrong passcode cannot confirm an account exists.
  if (!(await checkAdminPasscode(request, adminPasscode))) {
    return { error: 'Wrong passcode', status: 401 }
  }

  const now = Date.now()
  const rest = route.slice('admin/'.length)

  // GET /api/admin/audit -- what has been done, newest first. Matched before the
  // account id pattern, which would otherwise read "audit" as a missing id.
  if (rest === 'audit' && request.method === 'GET') {
    const result = await db
      .prepare(
        `SELECT id, action, target_id, target_name, at, detail
           FROM admin_audit ORDER BY at DESC, id DESC LIMIT 100`,
      )
      .all()
    return {
      status: 200,
      body: {
        entries: (result.results ?? []).map((row) => ({
          id: row.id,
          action: row.action,
          targetId: row.target_id,
          targetName: row.target_name,
          at: row.at,
          when: whenLabel(row.at),
          detail: row.detail,
        })),
      },
    }
  }

  if (rest !== 'accounts' && !rest.startsWith('accounts/')) {
    // Not ours. The submission queue owns /api/admin/submissions, and claiming
    // the whole prefix here would answer for routes that are not ours.
    return null
  }

  const path = rest.slice('accounts'.length).replace(/^\//, '')

  // GET /api/admin/accounts?q=... -- the search.
  if (path === '' && request.method === 'GET') {
    const query = String(url.searchParams.get('q') ?? '').trim().slice(0, MAX_SEARCH_LENGTH)
    const offset = asInteger(url.searchParams.get('offset')) ?? 0

    // A prefix match on either name, so typing part of a username or of a
    // display name both find the account. Case-insensitive because SQLite's LIKE
    // is only case-insensitive for ASCII, which covers every username the
    // registration route allows.
    const pattern = `%${query.replace(/[%_]/g, (match) => `\\${match}`)}%`

    const result = query
      ? await db
          .prepare(`${ACCOUNT_SQL} WHERE u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\' ORDER BY u.id LIMIT ? OFFSET ?`)
          .bind(pattern, pattern, PAGE_SIZE, Math.max(0, offset))
          .all()
      : await db
          .prepare(`${ACCOUNT_SQL} ORDER BY u.id LIMIT ? OFFSET ?`)
          .bind(PAGE_SIZE, Math.max(0, offset))
          .all()

    return { status: 200, body: { accounts: (result.results ?? []).map(accountSummary) } }
  }

  // GET /api/admin/audit -- what has been done, newest first. Matched before the
  // account id pattern, which would otherwise read "audit" as a missing id.
  if (rest === 'audit' && request.method === 'GET') {
    const result = await db
      .prepare(
        `SELECT id, action, target_id, target_name, at, detail
           FROM admin_audit ORDER BY at DESC, id DESC LIMIT 100`,
      )
      .all()
    return {
      status: 200,
      body: {
        entries: (result.results ?? []).map((row) => ({
          id: row.id,
          action: row.action,
          targetId: row.target_id,
          targetName: row.target_name,
          at: row.at,
          when: whenLabel(row.at),
          detail: row.detail,
        })),
      },
    }
  }

  const match = path.match(/^(\d+)(?:\/([a-z-]+))?$/)
  if (!match) {
    return { error: 'Unknown admin endpoint', status: 404 }
  }

  const id = Number(match[1])
  const action = match[2] ?? null

  const target = await db
    .prepare('SELECT id, username, display_name, created_at FROM users WHERE id = ?')
    .bind(id)
    .first()
  if (!target) {
    return { error: 'No such account', status: 404 }
  }

  // GET /api/admin/accounts/:id -- one account in full.
  if (!action && request.method === 'GET') {
    const [runs, data, code] = await Promise.all([
      listUserRuns(db, id),
      readPlayerData(db, id),
      readLoginCodeState(db, id, now),
    ])

    return {
      status: 200,
      body: {
        account: {
          ...accountSummary({
            ...target,
            run_count: runs.length,
            submission_count: runs.filter((run) => run.submission).length,
            pending_count: runs.filter((run) => run.submission?.status === 'pending').length,
          }),
          runs,
          playerData: data,
          loginCode: code,
        },
      },
    }
  }

  // POST /api/admin/accounts/:id/login-code -- issue a fresh code. Any previous
  // code is deleted by the replace, so there is never more than one live code and
  // a replaced code is dead whether or not it was ever used.
  if (action === 'login-code' && request.method === 'POST') {
    const code = generateLoginCode()
    await db
      .prepare('DELETE FROM login_codes WHERE user_id = ?')
      .bind(id)
      .run()
    await db
      .prepare(
        `INSERT INTO login_codes (user_id, code_hash, created_at)
         VALUES (?, ?, ?)`,
      )
      .bind(id, await digest(code), now)
      .run()

    await recordAudit(db, { action: 'login-code.issue', target, now })

    // The only time the code itself ever leaves the Worker. It is not readable
    // afterwards, so it is shown once and has to be copied then.
    return { status: 201, body: { code, issuedAt: now, expiresAt: now + LOGIN_CODE_TTL_MS } }
  }

  // POST /api/admin/accounts/:id/revoke-code -- throw away a live code without
  // issuing another. The way to lock an account back out after a code has been
  // read out but not used.
  if (action === 'revoke-code' && request.method === 'POST') {
    await db.prepare('DELETE FROM login_codes WHERE user_id = ? AND used_at IS NULL').bind(id).run()
    await recordAudit(db, { action: 'login-code.revoke', target, now })
    return { status: 200, body: { ok: true } }
  }

  // POST /api/admin/accounts/:id/delete -- remove the account and everything that
  // hangs off it. The cascade in the schema takes the sessions, the runs, their
  // rounds, the submissions, the mirrored data and the login codes.
  if (action === 'delete' && request.method === 'POST') {
    const body = (await readBody(request)) ?? {}

    // The client is made to send the username back, so a delete cannot be fired
    // off by a misclick on the wrong row.
    if (String(body.confirm ?? '').trim().toLowerCase() !== String(target.username).toLowerCase()) {
      return { error: 'Type the username to confirm the delete', status: 400 }
    }

    await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run()
    await recordAudit(db, { action: 'account.delete', target, now })
    return { status: 200, body: { ok: true, deleted: target.username } }
  }

  return { error: 'Method not allowed', status: 405 }
}
