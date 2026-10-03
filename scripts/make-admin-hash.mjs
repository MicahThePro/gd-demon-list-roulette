/**
 * Prints the exact string to paste into `npx wrangler secret put ADMIN_PASSCODE`.
 *
 * The secret is NOT your passcode. checkAdminPasscode hands the secret straight to
 * verifyPassword, which splits it on ":" and reads a salt and a hash out of it --
 * so a plaintext secret has no salt, no hash, and never matches anything. You would
 * paste a password, the panel would refuse it, and it would look like the secret
 * was set wrong rather than the format being wrong.
 *
 * This prints the whole `iterations:salt:hash` record that verifyPassword expects.
 *
 * Usage:
 *   node scripts/make-admin-hash.mjs "your new passcode"
 *
 * The passcode is read from argv rather than prompted for, so it does not end up in
 * your shell history or in a terminal scrollback. It is not written to any file: the
 * only record of it should be your password manager. Note that it is briefly visible
 * in this process's own argv, which on a shared machine is worth thinking about.
 */
import process from 'node:process'
import { createPasswordRecord } from '../worker/auth.js'

const passcode = process.argv[2]

if (!passcode) {
  console.error('Usage: node scripts/make-admin-hash.mjs "your new passcode"')
  process.exit(1)
}

if (passcode === '258456') {
  console.error(
    'That is the passcode already published in this repository. Using it would change nothing.\n' +
      'Pick something new, and prefer a long random string over six digits -- there is no\n' +
      'rate limiting on the admin routes, so a six digit code is a 1,000,000 space to grind.',
  )
  process.exit(1)
}

if (passcode.length < 12) {
  console.warn(
    `Warning: ${passcode.length} characters. There is no rate limiting on the admin routes, so\n` +
      'anything short can be brute forced. A long random string is the thing that actually helps.',
  )
}

const { passwordHash } = await createPasswordRecord(passcode)

console.log('\nPaste this into: npx wrangler secret put ADMIN_PASSCODE\n')
console.log(passwordHash)
console.log('\nThen paste your passcode itself into the /admin panel.')
console.log('Store it in a password manager -- it is not recoverable from the hash.\n')