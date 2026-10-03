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
// Enough characters that guessing one is hopeless, few enough to read aloud
// over a call and type by hand. Grouped in threes so it can be said in chunks.
const LOGIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/* A username reduced to exactly the form the accounts table stores, which is what
   a comparison has to be against.

   Registration and login both run a submitted name through this, so a name that
   went through either is already canonical. A username sent to a route that does
   not normalise -- /api/redeem, and the code branch of /api/login -- has not been,
   and comparing that raw text against a canonical one rejects names that are the
   same account. Trim, lowercase and drop anything outside the alphabet all happen
   here, so both sides of the comparison are the same shape. */
/* A username reduced to exactly the form the accounts table stores in the username
   column: lowercased, with only the characters a handle may contain and the length
   cap applied.
   A handle is an identity key rather than a label, so it has exactly one spelling.
   See the longer note on normalizeUsername in api.js, which is the copy that
   explains why. Registration and login both fold through this, so both sides of any
   comparison are the same shape and no lookup needs to think about case.
   Case is touched HERE, on the way in, so a username sent to a route that does not
   normalise -- /api/redeem, and the code branch of /api/login -- is still folded
   before it is compared against a stored one. */
export const canonicalUsername = (value) =>
  String(value ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_.]/g, '')
    .toLowerCase()
    .slice(0, 20)

/** The identity form of a name: the same thing, since usernames are stored folded. */
export const usernameKey = (value) => canonicalUsername(value)

/* Each character as U+XXXX. The only readable way to show a difference that
   renders as nothing. */
const codePoints = (value) =>
  [...String(value ?? '')]
    .map((char) => `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
    .join(' ')

// How long an issued code stays redeemable if it is never used. Long enough to
// hand over in person, short enough that a forgotten code on an unattended
// screen stops working.
const LOGIN_CODE_TTL_MS = 24 * 60 * 60 * 1000

/* Exported so the login route can accept a code in place of a password, which
   needs exactly the same rules -- same normalisation, same digest, same
   single-use claim. Two copies of that would be two chances to get the
   single-use part subtly different, and getting it wrong would mean a code
   works twice. */
export const LOGIN_CODE_LENGTH = 15
export const normalizeLoginCode = (value) =>
  String(value ?? '')
    .replace(/[\s-]/g, '')
    .toUpperCase()

/* Spends a login code and returns the user it belongs to, or an error.
 *
 * Shared by /api/redeem and by /api/login's code branch, so a code behaves
 * identically whichever way it is presented: one use, one account, one session.
 *
 * `expectedUsername` is checked BEFORE the code is claimed, and that order is the
 * whole point. Claiming first and comparing the account afterwards looked fine
 * and was not: a code presented with the wrong username was already spent by the
 * time the mismatch was noticed, so the rightful owner could never use it. A
 * wrong guess cost the code, which is exactly the wrong thing for a wrong guess
 * to cost. A code is a deliberate act by somebody holding it, so a failed
 * username is a typo, not an attack, and the fix is to make them type it again.
 *
 * The claim itself is a conditional UPDATE rather than a read-then-write, which
 * is what makes it genuinely single-use: two simultaneous redemptions produce one
 * session, because the loser of the race updates zero rows. */
export const redeemLoginCodeByHash = async (db, supplied, now, expectedUsername = null) => {
  const cleaned = normalizeLoginCode(supplied)
  if (cleaned.length !== LOGIN_CODE_LENGTH) {
    return { error: 'That is not a login code', status: 400 }
  }

  const hash = await digest(cleaned)
  // Every column is aliased because `id` exists on both tables: left unaliased
  // SQLite refuses the query outright, and the failure reads as a login code
  // that is not valid rather than as a broken statement.
  const row = await db
    .prepare(
      `SELECT l.id AS code_id, l.user_id, l.created_at, l.used_at, u.username
         FROM login_codes l
         JOIN users u ON u.id = l.user_id
        WHERE l.code_hash = ?`,
    )
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

  /* A username is optional, because /api/redeem worked without one for a long
     time and an old bookmark must keep working. But when one IS given it has to
     match: otherwise a code pasted into the wrong account's row would sign in as
     the code's real owner and say nothing about it. Compared before the claim, so
     a mistyped username does not cost anybody the code. */
  const wanted = usernameKey(expectedUsername)
  if (wanted && wanted !== usernameKey(row.username)) {
    return {
      error:
        `That code was issued for @${row.username}, not @${wanted}. ` +
        // The code points, because "these look identical" is the one report that
        // cannot be acted on. Two strings that render the same but differ are
        // almost always a homoglyph (a Cyrillic т for a Latin t, say) or a
        // character that looks like nothing at all, and neither is visible in a
        // sentence. Naming the bytes turns a puzzle into a fix.
        `The two are not the same text: sent ${codePoints(expectedUsername)}, ` +
        `account name is ${codePoints(row.username)}.`,
      status: 401,
    }
  }

  const claimed = await db
    .prepare('UPDATE login_codes SET used_at = ? WHERE id = ? AND used_at IS NULL RETURNING user_id')
    .bind(now, row.code_id)
    .first()

  if (!claimed) {
    return { error: 'That login code has already been used', status: 409 }
  }

  /* The id comes from the claim rather than from the row read above. The join
     that brought the username in has its own `users.id`, which shadows
     login_codes.user_id, so the id on that row is whichever column SQLite
     happened to surface first -- and reading it as row.user_id found nothing.
     The claim is the authoritative statement of which code was spent, so its
     RETURNING is the right place to take the id from anyway. */
  const user = await db
    .prepare('SELECT id, username, display_name, display_name_changed_at, created_at FROM users WHERE id = ?')
    .bind(claimed.user_id)
    .first()

  if (!user) {
    return { error: 'That account no longer exists', status: 404 }
  }

  return { user }
}

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
  SELECT u.id, u.username, u.display_name, u.display_name_changed_at, u.created_at,
         (SELECT COUNT(*) FROM runs r WHERE r.user_id = u.id) AS run_count,
         (SELECT COUNT(*) FROM runs r WHERE r.user_id = u.id
            AND NOT EXISTS (SELECT 1 FROM trashed_runs t WHERE t.run_id = r.id)) AS visible_run_count,
         (SELECT COUNT(*) FROM runs r JOIN trashed_runs t ON t.run_id = r.id
            WHERE r.user_id = u.id) AS trashed_count,
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
  displayNameChangedAt: row.display_name_changed_at ?? null,
  createdAt: row.created_at,
  // Every run the account holds, trashed included, because that is the number a
  // moderator is about to go through. The visible count and the trashed count
  // are reported beside it so a panel full of hidden runs is obvious at a glance.
  runCount: row.run_count ?? 0,
  visibleRunCount: row.visible_run_count ?? row.run_count ?? 0,
  trashedCount: row.trashed_count ?? 0,
  submissionCount: row.submission_count ?? 0,
  pendingCount: row.pending_count ?? 0,
  // Null rather than 0: the panel has to be able to say "this player has not
  // synced" instead of implying a zero that is really a blank.
  syncedAt: row.synced_at ?? null,
})

/* Every run the account holds -- submitted or not -- newest first, with its
   review state and whether it is currently trashed.
 *
   "All of their runs" means all of them: a run a player finished and saved to
   their account is on this list even though it was never sent for review, which
   is the whole reason a moderator needs a way to get at it. Left joins
   throughout, so a run with no submission and a run whose submission was deleted
   both still appear; the trashed marker is a left join too, so trashing never
   removes a run from this list. */
const listUserRuns = async (db, userId) => {
  const result = await db
    .prepare(
      `SELECT r.id, r.run_key, r.source, r.status, r.score, r.percent_step,
              r.passed, r.rounds_played, r.skipped, r.total_ms, r.created_at,
              s.id AS submission_id, s.status AS submission_status, s.review_note,
              t.run_id AS trashed_id, t.reason AS trashed_reason, t.trashed_at
         FROM runs r
         LEFT JOIN submissions s ON s.run_id = r.id
         LEFT JOIN trashed_runs t ON t.run_id = r.id
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
    trashed: row.trashed_id != null,
    trashedAt: row.trashed_at ?? null,
    trashReason: row.trashed_reason ?? null,
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
   admin route: the code itself is the credential, and it only works once.
   Redeemed here on its own, with no username. The login route accepts a code in
   the password field instead, and both go through the same claim in
   redeemLoginCodeByHash so a code cannot be spent twice between them. */
export const handleLoginCodeRoutes = async ({ db, request, key }) => {
  const route = key.replace(/^api\//, '')

  if (route !== 'redeem' || request.method !== 'POST') {
    return null
  }

  const body = await readBody(request)
  if (!body) {
    return { error: 'Could not read that request', status: 400 }
  }

  /* No username check of its own here. redeemLoginCodeByHash has already compared
     one, against the code's own account, before it claimed anything -- so
     re-checking it afterwards meant comparing against the session that had just
     been created, which is the same account and therefore never a mismatch. Two
     checks of one thing, one of them in the wrong place, and the second one could
     only ever be a stale comparison if the first were ever removed. */
  const result = await redeemLoginCodeByHash(db, body.code, Date.now(), body.username)
  if (result.error) {
    return { error: result.error, status: result.status }
  }

  const user = result.user
  const session = await createSession(db, user.id, Date.now())
  return {
    status: 200,
    body: {
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        displayNameChangedAt: user.display_name_changed_at ?? null,
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
  const passcode = await checkAdminPasscode(request, adminPasscode, db)
  if (!passcode.ok) {
    // A lockout carries its own status and wording, so the escalating ladder is
    // visible to whoever is typing rather than showing as a flat "Wrong passcode"
    // over and over. retry_after_seconds is what the panel counts down from.
    return {
      error: passcode.message ?? 'Wrong passcode',
      status: passcode.permanent ? 403 : passcode.locked ? 429 : 401,
      retry_after_seconds: passcode.retryAfterSeconds ?? null,
    }
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

  // POST /api/admin/accounts/:id/runs/:runId/trash | /untrash -- hide or restore
  // one run belonging to this account.
  //
  // Matched before the single-segment account pattern below, which would read
  // "runs" as a missing account id. The run id is scoped to the account in the
  // WHERE, so a run id belonging to somebody else is reported as not found here
  // rather than trashed.
  const runAction = path.match(/^(\d+)\/runs\/(\d+)\/(trash|untrash)$/)
  if (runAction) {
    if (request.method !== 'POST') {
      return { error: 'Method not allowed', status: 405 }
    }

    const accountId = Number(runAction[1])
    const runId = Number(runAction[2])
    const action = runAction[3]

    const run = await db
      .prepare('SELECT id, run_key, user_id FROM runs WHERE id = ? AND user_id = ?')
      .bind(runId, accountId)
      .first()
    if (!run) {
      return { error: 'That account has no such run', status: 404 }
    }

    const owner = await db
      .prepare('SELECT id, username, display_name, created_at FROM users WHERE id = ?')
      .bind(accountId)
      .first()

    if (action === 'trash') {
      // Insert or replace rather than insert-or-fail: trashing an already
      // trashed run is not an error, it just refreshes the reason and the time,
      // and the primary key is what stops a run being trashed twice.
      const body = (await readBody(request)) ?? {}
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) || null : null

      await db
        .prepare(
          `INSERT INTO trashed_runs (run_id, user_id, reason, trashed_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(run_id) DO UPDATE SET
             reason = excluded.reason,
             trashed_at = excluded.trashed_at`,
        )
        .bind(runId, accountId, reason, now)
        .run()

      await recordAudit(db, {
        action: 'run.trash',
        target: owner,
        now,
        detail: `run ${run.run_key}${reason ? `: ${reason}` : ''}`,
      })

      return { status: 200, body: { ok: true, trashed: true, runId } }
    }

    // Un-trashing only removes the marker. The run row and its rounds were never
    // touched, so an approved run comes back on the leaderboard with its
    // statistics and its rank exactly as they were.
    await db.prepare('DELETE FROM trashed_runs WHERE run_id = ?').bind(runId).run()
    await recordAudit(db, {
      action: 'run.untrash',
      target: owner,
      now,
      detail: `run ${run.run_key}`,
    })

    return { status: 200, body: { ok: true, trashed: false, runId } }
  }

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
            // Counted from the run list rather than re-queried, since the list
            // is already every run there is: the detail page's numbers cannot
            // disagree with the list printed under them.
            run_count: runs.length,
            visible_run_count: runs.filter((run) => !run.trashed).length,
            trashed_count: runs.filter((run) => run.trashed).length,
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
