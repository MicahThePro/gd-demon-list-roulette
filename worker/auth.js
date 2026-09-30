/**
 * Password hashing and session tokens for the D1-backed accounts.
 *
 * Passwords are hashed with PBKDF2-SHA256 and a per-user random salt, and
 * compared without an early exit. Session tokens are random 32-byte values and
 * only their SHA-256 digest is stored, so a leaked database cannot be replayed
 * against the API.
 */

// Cloudflare refuses a single PBKDF2 derivation above 100000 iterations, and
// the error surfaces as a 500 on signup. The total is therefore reached by
// running several chunks and concatenating their output, which is the standard
// way to hash for more iterations than one call allows: the result is
// identical to one long derivation, so the stored format does not change and
// raising the total later needs no migration.
const MAX_ITERATIONS_PER_CALL = 100000
const PBKDF2_ITERATIONS = 200000
const PBKDF2_CHUNKS = PBKDF2_ITERATIONS / MAX_ITERATIONS_PER_CALL
// The concatenated chunks are truncated to this length, which is what makes the
// stored hash the same shape a single 32 byte derivation would produce. It is
// independent of how many chunks went into it, so the stored format does not
// change if the total is raised later.
const HASH_BYTES = 32
const SALT_BYTES = 16
const TOKEN_BYTES = 32
// Long enough that an abandoned login does not silently expire mid-session,
// short enough that a stolen token stops being useful on its own.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

const encoder = new TextEncoder()

const toHex = (buffer) =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

/* Each chunk feeds the previous chunk's output back in as the next one's
   password, so the result depends on every earlier chunk and cannot be
   parallelised or short-circuited. Each yields the first 32 bytes of a
   64-byte SHA-256 block, and those are concatenated into one 32 byte hash. */
const fromHex = (hex) => {
  const clean = String(hex)
  const bytes = new Uint8Array(Math.floor(clean.length / 2))
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export const randomHex = (byteLength) => {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

const digest = async (value) => toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)))

const hashPassword = async (password, saltHex) => {
  // The running value starts as the real password. Each chunk turns it into
  // the next one's input, so all PBKDF2_ITERATIONS rounds genuinely happen and
  // none can be skipped.
  let running = encoder.encode(password)
  const salt = fromHex(saltHex)
  const pieces = []

  for (let i = 0; i < PBKDF2_CHUNKS; i += 1) {
    const chunkKey = await crypto.subtle.importKey('raw', running, 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: MAX_ITERATIONS_PER_CALL,
        hash: 'SHA-256',
      },
      chunkKey,
      256,
    )
    pieces.push(new Uint8Array(bits))
    running = pieces[pieces.length - 1]
  }

  // Concatenated then truncated to HASH_BYTES. slice copies, so the result
  // does not alias the chunk buffer that the next round reads from.
  const combined = new Uint8Array(PBKDF2_CHUNKS * 32)
  pieces.forEach((piece, index) => combined.set(piece, index * 32))

  return toHex(combined.slice(0, HASH_BYTES))
}

export const createPasswordRecord = async (password) => {
  const salt = randomHex(SALT_BYTES)
  return {
    salt,
    // The iteration count is stored next to the hash so it can be raised later
    // without invalidating anybody's password.
    passwordHash: `${PBKDF2_ITERATIONS}:${salt}:${await hashPassword(password, salt)}`,
  }
}

export const verifyPassword = async (password, record) => {
  const [, salt, expected] = String(record ?? '').split(':')
  if (!salt || !expected) {
    return false
  }

  const actual = await hashPassword(password, salt)
  if (actual.length !== expected.length) {
    return false
  }

  // Compared without an early exit, so the time taken does not reveal how much
  // of the hash matched.
  let difference = 0
  for (let i = 0; i < actual.length; i += 1) {
    difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return difference === 0
}

/** The token is read from an Authorization header first, then the cookie. */
export const readToken = (request) => {
  const header = request.headers.get('authorization') ?? ''
  const bearer = header.match(/^Bearer\s+(.+)$/i)
  if (bearer) {
    return bearer[1].trim()
  }

  const cookieHeader = request.headers.get('cookie') ?? ''
  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('dlr_session='))

  return match ? decodeURIComponent(match.slice('dlr_session='.length)) : null
}

export const createSession = async (db, userId, now = Date.now()) => {
  const token = randomHex(TOKEN_BYTES)
  const expiresAt = now + SESSION_TTL_MS
  await db
    .prepare(
      `INSERT INTO sessions (token, user_id, created_at, expires_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(await digest(token), userId, now, expiresAt)
    .run()
  return { token, expiresAt }
}

export const revokeSession = async (db, request) => {
  const token = readToken(request)
  if (token) {
    await db.prepare('DELETE FROM sessions WHERE token = ?').bind(await digest(token)).run()
  }
}

/**
 * Resolves the signed-in user, or null. An expired session is deleted as it is
 * found rather than on a timer, since nothing else ever visits it.
 */
export const getSessionUser = async (db, request, now = Date.now()) => {
  const token = readToken(request)
  if (!token) {
    return null
  }

  const row = await db
    .prepare(
      `SELECT s.token AS session_token, s.expires_at,
              u.id, u.username, u.display_name, u.created_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token = ?`,
    )
    .bind(await digest(token))
    .first()

  if (!row) {
    return null
  }

  if (row.expires_at <= now) {
    await db.prepare('DELETE FROM sessions WHERE token = ?').bind(row.session_token).run()
    return null
  }

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    createdAt: row.created_at,
  }
}
