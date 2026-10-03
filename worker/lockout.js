/**
 * Escalating lockouts for the admin passcode.
 *
 * The passcode guards routes that can delete an account and sign in as any player.
 * A PBKDF2 comparison is deliberately slow, but slow is not a limit: without a
 * record of attempts the same guess can be retried for as long as the attacker
 * likes, from as many addresses as they like. A six digit code is a 1,000,000
 * space and needs no cleverness at all, only patience.
 *
 * The schedule is the escalating one: the first few wrong guesses cost a minute,
 * then five, then it doubles and keeps doubling, until the wait is longer than
 * anybody's patience -- by the last step, roughly a day and a half. One step past
 * the end of that and the address is banned outright.
 *
 * Everything here is on the Worker, keyed on the client address, so none of it can
 * be reset from the browser. A localStorage flag or a cookie would be the first
 * thing an attacker clears; a row in D1 is not theirs to delete.
 */

/* The wait after each consecutive failure, in minutes. Index 0 is the delay before
 * the FIRST guess after one failure, so the first wrong answer costs one minute.
 *
 * The doubling is the point. It reaches 1920 minutes -- 32 hours -- at the end, so
 * a locked-out attacker is not grinding through the space between attempts, they
 * are waiting months for a single one. The step after the last is the ban. */
export const LOCKOUT_SCHEDULE_MINUTES = [1, 5, 10, 30, 60, 120, 240, 480, 960, 1920]

/** One more failure past the end of the schedule is a permanent ban. */
const BAN_THRESHOLD = LOCKOUT_SCHEDULE_MINUTES.length + 1

const MINUTE_MS = 60 * 1000

/* One wording for the permanent ban, in one place. It is returned by the lockout, by
 * the passcode check and by the whole-API refusal in worker/index.js, and three copies
 * would drift -- and a drift here would mean a device is told it is unbanned by one
 * path while another still refuses it. */
export const PERMANENT_BAN_MESSAGE =
  'This device has been permanently blocked after repeated incorrect admin passcode attempts.'

/**
 * The client address, as a single string.
 *
 * The platform's own value is used rather than anything assembled from headers: the
 * Worker runs on Cloudflare, where CF-Connecting-IP is set by the edge and cannot be
 * spoofed by the caller. Reading X-Forwarded-For instead would let an attacker pad
 * that header and pick whichever address suited them, which defeats the whole table.
 */
export const clientKeyFor = (request) => {
  const address = request.headers.get('cf-connecting-ip') ?? ''
  return address.trim() || 'unknown'
}

/** Reads the record for one address, or null when there is none. */
const readAttempt = async (db, clientKey) =>
  db
    .prepare(
      `SELECT client_key, failures, next_allowed, banned_at
         FROM admin_attempts
        WHERE client_key = ?`,
    )
    .bind(clientKey)
    .first()

/**
 * Whether a guess is acceptable right now, and if not, why.
 *
 * Called before the passcode is checked. A banned address is refused forever and a
 * waiting one is refused until its next_allowed, so the expensive hash is not even
 * spent on a guess that cannot succeed.
 */
export const checkLockout = async (db, request, now = Date.now()) => {
  const clientKey = clientKeyFor(request)
  const record = await readAttempt(db, clientKey)

  // No row means no failures, so there is nothing to wait for.
  if (!record) {
    return { allowed: true, clientKey, retryAfterSeconds: 0 }
  }

  if (record.banned_at !== null && record.banned_at !== undefined) {
    return {
      allowed: false,
      permanent: true,
      clientKey,
      retryAfterSeconds: null,
      reason: PERMANENT_BAN_MESSAGE,
    }
  }

  if (record.next_allowed > now) {
    return {
      allowed: false,
      permanent: false,
      clientKey,
      retryAfterSeconds: Math.ceil((record.next_allowed - now) / 1000),
      reason: 'Too many incorrect admin passcode attempts. Wait before trying again.',
    }
  }

  return { allowed: true, clientKey, retryAfterSeconds: 0 }
}

/**
 * Records a wrong guess and returns the lockout state it produced.
 *
 * The failure count is read and written here rather than incremented in SQL, because
 * the next wait depends on the value that was there before. Doing it in one UPDATE
 * would need the schedule indexed in the database, which would put the policy in the
 * schema where changing it means a migration.
 */
export const recordFailure = async (db, request, now = Date.now()) => {
  const clientKey = clientKeyFor(request)
  const record = await readAttempt(db, clientKey)
  const failures = (record?.failures ?? 0) + 1

  if (failures >= BAN_THRESHOLD) {
    await db
      .prepare(
        `INSERT INTO admin_attempts (client_key, failures, next_allowed, banned_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(client_key) DO UPDATE SET
           failures = excluded.failures,
           next_allowed = excluded.next_allowed,
           banned_at = excluded.banned_at,
           updated_at = excluded.updated_at`,
      )
      .bind(clientKey, failures, now, now, now)
      .run()

    return {
      clientKey,
      failures,
      banned: true,
      retryAfterSeconds: null,
      message: PERMANENT_BAN_MESSAGE,
    }
  }

  const waitMinutes = LOCKOUT_SCHEDULE_MINUTES[failures - 1]
  const nextAllowed = now + waitMinutes * MINUTE_MS

  await db
    .prepare(
      `INSERT INTO admin_attempts (client_key, failures, next_allowed, banned_at, updated_at)
       VALUES (?, ?, ?, NULL, ?)
       ON CONFLICT(client_key) DO UPDATE SET
         failures = excluded.failures,
         next_allowed = excluded.next_allowed,
         updated_at = excluded.updated_at`,
    )
    .bind(clientKey, failures, nextAllowed, now)
    .run()

  return {
    clientKey,
    failures,
    banned: false,
    retryAfterMinutes: waitMinutes,
    retryAfterSeconds: waitMinutes * 60,
    message:
      `Incorrect admin passcode. ${failures} failure${failures === 1 ? '' : 's'} in a row: ` +
      `the next attempt is allowed in ${formatWait(waitMinutes)}.`,
  }
}

/**
 * Clears the record after a correct guess.
 *
 * A correct answer resets the ladder, so a moderator who fumbles twice and then types
 * it properly starts clean. Without this the schedule would carry over and one typo
 * in a long session could leave somebody waiting an hour.
 *
 * The row is deleted rather than zeroed, so a moderator who has stopped mistyping
 * leaves nothing behind.
 */
export const clearFailures = async (db, clientKey) => {
  await db.prepare('DELETE FROM admin_attempts WHERE client_key = ?').bind(clientKey).run()
}

/** "in 1 minute" / "in 32 hours", so the message reads like a sentence. */
const formatWait = (minutes) => {
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`
  }
  const hours = minutes / 60
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }
  const days = Math.round((hours / 24) * 10) / 10
  return `${days} day${days === 1 ? '' : 's'}`
}

/**
 * Whether this address is permanently banned, as a boolean.
 *
 * A separate read from checkLockout on purpose: this one is called ahead of every API
 * route, so it must not answer a question about a waiting period -- only the permanent
 * ban, which is the state that outlasts any timer. The error message is not returned
 * because worker/index.js writes it, and having one place that decides the wording
 * keeps the two from drifting.
 */
export const isBanned = async (db, request) => {
  const record = await readAttempt(db, clientKeyFor(request))
  return Boolean(record && record.banned_at !== null && record.banned_at !== undefined)
}

/**
 * Lifts a ban, by address.
 *
 * The way out of a permanent ban. It is a script and not a page on the site on
 * purpose: a ban that could be lifted from the site it locks you out of would not be
 * one. There is deliberately no self-service unlock, because a self-service unlock is
 * an unlock an attacker can reach too.
 */
export const unbanClient = async (db, clientKey) => {
  const result = await db
    .prepare('DELETE FROM admin_attempts WHERE client_key = ? AND banned_at IS NOT NULL')
    .bind(clientKey)
    .run()

  return (result?.meta?.changes ?? 0) > 0
}

/** Every current ban, newest first. For looking at who is locked out. */
export const listBans = async (db, limit = 50) => {
  const { results } = await db
    .prepare(
      `SELECT client_key, failures, banned_at
         FROM admin_attempts
        WHERE banned_at IS NOT NULL
        ORDER BY banned_at DESC
        LIMIT ?`,
    )
    .bind(limit)
    .all()

  return results ?? []
}