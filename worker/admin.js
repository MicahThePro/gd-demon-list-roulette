/**
 * The moderation passcode.
 *
 * Deliberately not an account in the users table. The passcode is a single
 * shared secret, it is never a row anybody can be signed in as, and it is
 * compared in constant time against a PBKDF2 hash stored as a Worker secret
 * rather than in this repository, so it is not in the deployed JavaScript at
 * all and cannot be read by anyone who loads the page.
 *
 * Set it with:
 *   npx wrangler secret put ADMIN_PASSCODE
 *
 * The hash below is the site owner's chosen passcode. It is a secret only in
 * the sense that it is not in this file as plaintext: anyone who reads this
 * source can see the hash, and a six digit code is small enough to brute force
 * against that hash. It is stored as a Worker secret so the plaintext is not in
 * the deployed JavaScript or the repo's history, which stops it being read out
 * of a page or a commit, but it is not a strong secret and should be treated
 * as one moderator's key rather than a vault. Replace it with a longer code if
 * that matters.
 *
 * A brute force is also bounded by the Worker itself: a 200000 iteration
 * PBKDF2 comparison is deliberately slow, and Cloudflare's free tier caps
 * requests per second, so trying a million codes is not fast. That is a
 * speed bump, not a lock.
 */

import { verifyPassword } from './auth.js'
import { checkLockout, clearFailures, recordFailure } from './lockout.js'

/* There is deliberately NO default passcode any more.
 *
 * This used to hold a PBKDF2 hash of the owner's chosen passcode, so the panel worked
 * on a first deploy with no setup step. That hash was in this repository, and so was
 * the plaintext that hashes from -- in a test fixture, readable by anyone who opened
 * the project. Six digits is a small enough space that it took seconds to confirm the
 * two matched. Anything committed here is published, so a fallback secret in source is
 * not a secret at all, and "convenient on first deploy" was not worth it.
 *
 * The panel now refuses to answer until a real secret exists. Set it with:
 *   node scripts/make-admin-hash.mjs "a long passcode"   # then paste the hash it prints
 *   npx wrangler secret put ADMIN_PASSCODE
 *
 * A missing secret is reported as itself, not as a wrong passcode: telling the owner
 * "that is not the passcode" when the real answer is "no passcode has been set" sends
 * somebody looking in the wrong place entirely. */
const resolveHash = (secret) => {
  if (secret) {
    return secret
  }
  throw new Error(
    'ADMIN_PASSCODE is not set. Generate a hash with ' +
      '`node scripts/make-admin-hash.mjs "your passcode"` and set it with ' +
      '`npx wrangler secret put ADMIN_PASSCODE`.',
  )
}

// The one header a browser will not let a third party site attach on a
// cross-origin request, so a page on GitHub Pages cannot drive the admin API
// even if someone worked out the route.
export const isAdminRequest = (request) => {
  const supplied = request.headers.get('x-admin-passcode') ?? ''
  return supplied.length > 0
}
// There is no admin session to speak of: the passcode is re-sent on every
// admin call, and every call re-checks it. That is fine at this scale, where
// a moderator makes a handful of calls, and it means there is no long-lived
// admin token to steal or revoke.
//
// The check is two stages: the lockout ladder first, then the hash. Order matters --
// a guess made during a wait is refused before the slow PBKDF2 derivation runs, so a
// locked-out attacker cannot spend requests grinding, and every refused attempt is
// one that never reached the hash at all. The ladder lives in worker/lockout.js and
// is keyed on the client address in D1, so it survives a cleared browser, a new
// browser, and a new device; a localStorage flag would not.
//
// A wrong answer advances the ladder and returns how long to wait. A right one
// clears it, so a moderator who fumbles their own code twice is not punished for the
// third, correct one. Only the ladder lives in the database and the request address;
// nothing about it is sent to the client, because anything sent to the client can be
// edited, and the client is where the attacker is.
export const checkAdminPasscode = async (request, expected, db, now = Date.now()) => {
  const supplied = request.headers.get('x-admin-passcode') ?? ''

  /* Nothing supplied is not a guess.
   *
   * The ladder counts wrong ANSWERS, and a request that never offered a passcode has
   * not made one. Counting it would mean any stray request to an admin route advanced
   * the ladder -- so somebody who had never even tried the passcode could push the
   * owner into a wait, and, eleven requests later, into a permanent ban. It would
   * also mean a shared address punished for something none of its users did: a phone
   * on a mobile carrier shares one address with thousands of strangers, and a school
   * or office does the same. Only somebody actually guessing moves it.
   *
   * Still refused, obviously. It just does not count. */
  if (!supplied) {
    return { ok: false, message: 'Wrong passcode' }
  }

  // The lockout is skipped when there is no database to keep it in. A Worker without
  // its D1 binding already refuses every admin route before reaching here, so this
  // only affects a direct unit call, and answering honestly is better than pretending
  // to have checked something that was not checked.
  if (!db) {
    return { ok: await verifyPassword(supplied, resolveHash(expected)) }
  }

  const lockout = await checkLockout(db, request, now)
  const hash = resolveHash(expected)

  /* A permanent ban is refused outright, without hashing.
   *
   * This is the one case that short-circuits ahead of the PBKDF2 work. A banned
   * device is not going to be let in whatever it types, so spending the server's
   * CPU to find that out would be pure waste -- and a banned client hammering this
   * endpoint is exactly the case where the cost matters. */
  if (!lockout.allowed && lockout.permanent) {
    return {
      ok: false,
      locked: true,
      permanent: true,
      retryAfterSeconds: null,
      message: lockout.reason,
    }
  }

  /* A temporary wait still compares the passcode.
   *
   * Refusing during the wait without checking would be cheaper, but it would lock
   * the owner out too: someone who fumbles twice, waits, and then types the right
   * code would be told to come back later for no reason, and the only way out would
   * be waiting out a delay they do not understand. Letting a correct answer through
   * costs one hash and helps nobody who does not already have the code.
   *
   * A wrong answer during the wait is still refused, and still does not advance the
   * ladder: advancing it would let a client that retries on a timer escalate itself
   * into a permanent ban without anyone ever typing a new wrong guess. */
  const ok = await verifyPassword(supplied, hash)

  if (ok) {
    await clearFailures(db, lockout.clientKey)
    return { ok: true }
  }

  if (!lockout.allowed) {
    return {
      ok: false,
      locked: true,
      permanent: false,
      retryAfterSeconds: lockout.retryAfterSeconds,
      message: lockout.reason,
    }
  }

  const penalty = await recordFailure(db, request, now)
  return {
    ok: false,
    locked: true,
    permanent: penalty.banned,
    retryAfterSeconds: penalty.retryAfterSeconds ?? null,
    message: penalty.message,
  }
}
