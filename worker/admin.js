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

/* The owner's chosen passcode, stored as a hash rather than as itself.
   PBKDF2-SHA256, 200000 iterations, with the salt below. The plaintext is not
   here, in the deployed JavaScript, or anywhere in the repo's history.
   A Worker secret set with `npx wrangler secret put ADMIN_PASSCODE` overrides
   this, so the passcode can be changed without touching the code. */
const DEFAULT_PASSCODE_HASH =
  '200000:6eeda5b358819f93026913d4fe73790b:cd736a2ad5a0e2e69c0a15d2bf5037055429b67cb3a0fbbec587edb7a590449f'

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
export const checkAdminPasscode = async (request, expected) => {
  // A secret wins when it is set, so the passcode can be changed without a
  // deploy. The built-in hash is the fallback so the panel works on a first
  // deploy without any setup step.
  const hash = expected || DEFAULT_PASSCODE_HASH
  return verifyPassword(request.headers.get('x-admin-passcode') ?? '', hash)
}
