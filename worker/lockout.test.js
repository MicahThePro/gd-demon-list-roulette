/**
 * The escalating admin lockout.
 *
 * The bug this prevents is not hypothetical. The admin passcode guards routes that
 * can delete an account and sign in as any player, it was published in this
 * repository as plaintext, and there was no record of failed attempts at all -- so a
 * six digit code was a 1,000,000 space to grind through at whatever rate the network
 * allowed. A slow hash is not a limit.
 *
 * These tests walk the whole ladder end to end, because the ladder is the part most
 * likely to be wrong in a way that does not show up in normal use: an off-by-one in
 * the schedule quietly makes the last step permanent, or makes a permanent ban
 * reachable one guess early, or lets a retry-on-a-timer escalate itself into a ban
 * nobody asked for. Each of those is asserted on explicitly below.
 *
 * Run with:  node --experimental-sqlite worker/lockout.test.js
 */
import process from 'node:process'
import { createTestDb } from './testDb.js'

import { checkAdminPasscode } from './admin.js'
import { createPasswordRecord } from './auth.js'
import { LOCKOUT_SCHEDULE_MINUTES, isBanned, listBans, unbanClient } from './lockout.js'

/* A hash and the passcode it is of, both belonging to this file.
 *
 * They are generated together rather than copied, because a hash and a plaintext only
 * work as a pair if they actually match -- and checking that by hand means either
 * trusting a copied value or reading a real passcode out of a real file. Generating
 * both from one string makes the pairing impossible to get wrong. */
const RIGHT = 'the-site-owner-passcode'
const HASH = (await createPasswordRecord(RIGHT)).passwordHash

let failures = 0
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  pass  ${name}`)
  } else {
    failures += 1
    console.log(`  fail  ${name}${detail ? ` -- ${detail}` : ''}`)
  }
}

const createDb = () => createTestDb()

/* The address is fixed per call so a test can play two devices off against each
 * other. A shared address would be a shared lockout, which is the other half of what
 * the table is for.
 *
 * `now` is passed in and advanced by hand rather than left to Date.now(). The ladder
 * is a sequence of waits, so walking it means letting each wait expire before making
 * the next guess; without a clock the test would sit inside the first one minute and
 * every step after the first would be refused for being early. That is the test
 * measuring the wrong thing -- the ladder's job is to say "not yet", and it does that
 * correctly -- so the clock is stepped past each wait instead. */
const call = (db, passcode, ip = '203.0.113.7', { hash = HASH, now = Date.now() } = {}) =>
  checkAdminPasscode(new Request('https://worker.test/api/admin/accounts', {
    headers: { 'x-admin-passcode': passcode, 'cf-connecting-ip': ip },
  }), hash, db, now)

/* Rows are read through the same promise-based surface the Worker code uses, rather
 * than by reaching into node:sqlite, so a test cannot pass against a shape the
 * production database would not return. */
const failuresFor = (db, ip) =>
  db.prepare('SELECT failures FROM admin_attempts WHERE client_key = ?').bind(ip).first()

/**
 * Burns failures down an address, waiting out each delay.
 *
 * This is what a real attacker does: guess, get told to wait, wait, guess again. Doing
 * it here means the test proves the ladder *climbs* rather than proving the first step
 * is 1 minute.
 */
const climbToBan = async (db, ip) => {
  let now = Date.now()
  for (let step = 0; step < LOCKOUT_SCHEDULE_MINUTES.length + 1; step += 1) {
    const result = await call(db, 'wrong', ip, { now })
    // Step past whatever wait this one set, so the next guess is not merely early.
    now += ((result.retryAfterSeconds ?? 0) + 1) * 1000
  }
  return now
}

console.log('\nescalating admin lockout')

console.log('\n  the schedule is the one that was asked for')
{
  check(
    'the waits are 1, 5, 10, 30, 60, 120, 240, 480, 960, 1920 minutes',
    LOCKOUT_SCHEDULE_MINUTES.join(',') === '1,5,10,30,60,120,240,480,960,1920',
    LOCKOUT_SCHEDULE_MINUTES.join(','),
  )
  check('there are ten steps before the ban', LOCKOUT_SCHEDULE_MINUTES.length === 10)
  check('the last step is over 24 hours', LOCKOUT_SCHEDULE_MINUTES.at(-1) > 24 * 60)
}

console.log('\n  walks the whole ladder')
{
  const db = createDb()
  let now = Date.now()

  for (let failure = 1; failure <= LOCKOUT_SCHEDULE_MINUTES.length; failure += 1) {
    const result = await call(db, 'wrong', '203.0.113.7', { now })
    const expectedMinutes = LOCKOUT_SCHEDULE_MINUTES[failure - 1]

    check(
      `failure ${failure} waits ${expectedMinutes} minute(s)`,
      result.retryAfterSeconds === expectedMinutes * 60,
      `got ${result.retryAfterSeconds}s`,
    )
    check(`failure ${failure} is not a permanent ban`, !result.permanent)
    check(`failure ${failure} says how long`, /allowed in/.test(result.message ?? ''), result.message)

    // Wait the delay out before the next guess, the way a real attempt would.
    now += (result.retryAfterSeconds + 1) * 1000
  }

  // One past the end of the schedule: permanent.
  const banned = await call(db, 'wrong', '203.0.113.7', { now })
  check('the eleventh failure is a permanent ban', banned.permanent === true)
  check('and it says so', /permanently blocked/i.test(banned.message ?? ''), banned.message)

  db.close()
}

console.log('\n  a guess during a wait is refused, and does not escalate')
{
  const db = createDb()

  await call(db, 'wrong') // 1 failure -> 1 minute wait
  const during = await call(db, 'wrong')

  check('a second guess inside the wait is refused', during.ok === false)
  check('it is reported as locked out', during.locked === true)
  check('it is NOT a permanent ban', during.permanent !== true, JSON.stringify(during))
  check(
    'it says to wait rather than that it is wrong',
    /wait/i.test(during.message ?? ''),
    during.message,
  )

  // The critical assertion: guessing again while waiting must not have counted.
  // Otherwise a client retrying on a timer escalates itself into a permanent ban,
  // which would lock out the owner's own IP for a typo loop.
  const stillOne = await failuresFor(db, '203.0.113.7')
  check('the failure count did not move', stillOne?.failures === 1, `failures=${stillOne?.failures}`)

  db.close()
}

console.log('\n  a correct passcode resets the ladder')
{
  const db = createDb()

  await call(db, 'wrong')
  await call(db, 'wrong')
  await call(db, 'wrong') // three failures

  const right = await call(db, RIGHT)
  check('the right passcode still works', right.ok === true)

  const row = await failuresFor(db, '203.0.113.7')
  check('the record is cleared, not just zeroed', row === null, JSON.stringify(row))

  // And the very next wrong guess starts from one minute again.
  const after = await call(db, 'wrong')
  check('the next failure starts at one minute again', after.retryAfterSeconds === 60, `got ${after.retryAfterSeconds}`)

  db.close()
}

console.log('\n  two devices are counted separately')
{
  const db = createDb()

  await climbToBan(db, '198.51.100.1')
  check('the first address is banned', await isBanned(db, req('198.51.100.1')))

  // A different address must be unaffected -- including one that typed the same
  // wrong code, which is the shared-household / shared-NAT case.
  const other = await call(db, RIGHT, '198.51.100.2')
  check('a different address is untouched', other.ok === true, JSON.stringify(other))

  db.close()
}

function req(ip) {
  return new Request('https://worker.test/api/leaderboard', {
    headers: { 'cf-connecting-ip': ip },
  })
}

console.log('\n  a permanent ban covers the whole API, not just admin')
{
  const db = createDb()
  await climbToBan(db, '198.51.100.9')

  check('isBanned sees the ban', await isBanned(db, req('198.51.100.9')))
  check(
    'an unbanned address is not banned',
    (await isBanned(db, req('198.51.100.10'))) === false,
  )

  const bans = await listBans(db)
  check('the ban is listed', bans.some((b) => b.client_key === '198.51.100.9'), JSON.stringify(bans))

  db.close()
}

console.log('\n  a ban can be lifted')
{
  const db = createDb()
  await climbToBan(db, '198.51.100.20')
  check('banned before the lift', await isBanned(db, req('198.51.100.20')))

  check('unbanClient reports it lifted something', (await unbanClient(db, '198.51.100.20')) === true)
  check('no longer banned', (await isBanned(db, req('198.51.100.20'))) === false)
  check('the right passcode works again', (await call(db, RIGHT, '198.51.100.20')).ok === true)

  // Lifting a ban that is not there is not an error, so a script cannot crash on a
  // typo and leave the owner locked out of their own unban tool.
  check('unbanning an unknown address is harmless', (await unbanClient(db, '10.0.0.1')) === false)

  db.close()
}

console.log('\n  the address cannot be chosen by the caller')
{
  const db = createDb()

  // CF-Connecting-IP is set by Cloudflare's edge and cannot be spoofed. The point of
  // the assertion is that a caller piling on X-Forwarded-For does not move their
  // record to somebody else's row.
  const attacker = new Request('https://worker.test/api/admin/accounts', {
    headers: {
      'x-admin-passcode': 'wrong',
      'cf-connecting-ip': '198.51.100.30',
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      'x-real-ip': '9.9.9.9',
    },
  })
  await checkAdminPasscode(attacker, HASH, db)

  const spoofed = await db.prepare('SELECT client_key FROM admin_attempts').first()
  check(
    'the record is filed under the edge address, not the header',
    spoofed?.client_key === '198.51.100.30',
    JSON.stringify(spoofed),
  )

  db.close()
}

console.log('\n  a banned address is refused without even hashing')
{
  const db = createDb()
  await climbToBan(db, '198.51.100.40')

  // Counted by a passcode whose .length would be read if it were compared. verifyPassword
  // splits the record and measures the hash, so a Proxy on the record stands in for the
  // whole derivation without reimplementing PBKDF2 -- and it proves the ladder
  // short-circuits ahead of the expensive work. Otherwise a banned client hammering
  // this endpoint could still spend the server's CPU on every rejected guess.
  let touched = false
  const tripwire = new Proxy(
    { record: HASH },
    {
      get(target, prop) {
        touched = true
        return target[prop]
      },
    },
  )

  const banned = await checkAdminPasscode(
    new Request('https://worker.test/api/admin/accounts', {
      headers: { 'x-admin-passcode': 'anything', 'cf-connecting-ip': '198.51.100.40' },
    }),
    tripwire,
    db,
  )
  check('the banned address is refused', banned.ok === false)
  check('the passcode was never compared', touched === false)

  db.close()
}

console.log(`\n${failures ? `${failures} check(s) failed.` : 'All checks passed.'}`)
process.exit(failures ? 1 : 0)