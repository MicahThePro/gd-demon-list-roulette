/**
 * Password hashing checks.
 *
 * The iteration count is split across several PBKDF2 calls because Cloudflare
 * rejects any single call above 100000 iterations. That split is easy to get
 * subtly wrong, so it is checked here directly: the derived hash must be stable
 * for one password, must differ per salt, and must not be the value a
 * single-call derivation would produce.
 *
 * Run with: node --experimental-sqlite worker/auth.test.js
 */
import process from 'node:process'
import { createPasswordRecord, verifyPassword, randomHex } from './auth.js'

let failures = 0
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  pass  ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`)
  }
}

console.log('password hashing')
{
  const record = await createPasswordRecord('correct horse battery staple')

  const [iterations, salt, hash] = record.passwordHash.split(':')
  check('the record stores the iteration count', Number(iterations) === 200000, iterations)
  check('the record stores a 16 byte salt', salt.length === 32, salt)
  check('the record stores a 32 byte hash', hash.length === 64, hash)
  check('the plaintext is nowhere in the record', !record.passwordHash.includes('correct horse'))

  check('the right password verifies', await verifyPassword('correct horse battery staple', record.passwordHash))
  check('the wrong password does not verify', !(await verifyPassword('wrong horse', record.passwordHash)))
  check('a prefix of the right password does not verify', !(await verifyPassword('correct horse', record.passwordHash)))
  check('an empty password does not verify', !(await verifyPassword('', record.passwordHash)))

  // A single-call derivation at the same iteration count must not match, which
  // proves the chunking is really being applied rather than quietly ignored.
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('correct horse battery staple'), 'PBKDF2', false, ['deriveBits'])
  const single = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: Uint8Array.from(salt.match(/../g).map((h) => Number.parseInt(h, 16))), iterations: 200000, hash: 'SHA-256' },
      key,
      256,
    ),
  )
  const singleHex = [...single].map((b) => b.toString(16).padStart(2, '0')).join('')
  check('the hash is not a plain single-call derivation', singleHex !== hash)

  // Verification must work on a hash that was made by a different call, which
  // is what happens on a real sign-in after sign-up.
  check('verification is stable across calls', await verifyPassword('correct horse battery staple', record.passwordHash))
}

console.log('salts and tokens')
{
  const first = await createPasswordRecord('same password')
  const second = await createPasswordRecord('same password')
  check('the same password hashes differently per salt', first.passwordHash !== second.passwordHash)
  check('each has its own salt', first.salt !== second.salt)
  check('the first still verifies', await verifyPassword('same password', first.passwordHash))
  check('the second still verifies', await verifyPassword('same password', second.passwordHash))
  // A hash is only useful if it is bound to the salt it was made with.
  check("one salt cannot verify the other's hash", !(await verifyPassword('same password', `200000:${second.salt}:${first.passwordHash.split(':')[2]}`)))

  const token = randomHex(32)
  check('a token is 64 hex characters', token.length === 64, String(token.length))
  check('tokens are random', token !== randomHex(32))
  check('tokens are hex only', /^[0-9a-f]{64}$/.test(token))

  check('a malformed record is rejected, not crashed on', !(await verifyPassword('anything', 'garbage')))
  check('an empty record is rejected', !(await verifyPassword('anything', '')))
  check('a truncated hash is rejected', !(await verifyPassword('a', `200000:${first.salt}:deadbeef`)))
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
