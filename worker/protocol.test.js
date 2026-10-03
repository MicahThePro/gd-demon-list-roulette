/**
 * The version gate: an archived build must not be able to use the API.
 *
 * The bug this prevents is a real one. A build under versions/ is a complete,
 * working site -- it still runs, it still has the accounts and the global
 * leaderboard in its bundle -- and it used to talk to this same Worker. So a
 * player on, say, v1.4 could sign in and submit a run scored by that build's
 * rules, and it would land on the same leaderboard as everyone else's. The
 * archived bundles are separately blocked in the browser, but that guard is only
 * a speed bump: devtools undoes it. These tests are for the real rule, which is
 * enforced here and cannot be undone from a console.
 *
 * The shape of the gate is a required protocol header. What matters is not the
 * header's name but that the refusal happens before a route runs, so these tests
 * assert on the observable result rather than on internals: a request without the
 * header gets the refusal, and the database is never touched.
 */
import process from 'node:process'
import worker from './index.js'
import { createTestDb } from './testDb.js'
import { PROTOCOL_HEADER, PROTOCOL_VALUE } from './protocol.js'

const BASE = 'https://worker.test'

let passed = 0
let failed = 0

const check = (name, condition, detail) => {
  if (condition) {
    passed += 1
    console.log(`  ok    ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`)
  }
}

/* A DB stand-in that fails loudly if a REFUSED request reaches the database.
 *
 * The version gate and the permanent ban both have to refuse before the first query,
 * so a test that trips this is a gate that ran too late -- the difference between
 * refusing a request and merely answering it differently.
 *
 * Used only by the tests that expect a refusal. A request that is *allowed* through
 * legitimately reads the ban table, so those tests use a real in-memory database
 * instead; asserting that a permitted request touches nothing would be asserting that
 * the ban check does not exist.
 *
 * `db` has to be a property rather than a class instance: the Worker checks
 * `env?.DB` for truthiness only, so anything would do, but an object keeps the
 * tripwire's own fields away from the prototype chain it is proxying. */
const tripwireDb = new Proxy(
  {
    prepare() {
      throw new Error('The database was touched by a request a gate should have refused')
    },
    batch() {
      throw new Error('The database was touched by a request a gate should have refused')
    },
  },
  {
    get(target, prop) {
      return prop in target ? target[prop] : undefined
    },
  },
)

/* For the tests where the request is meant to be allowed through, and so legitimately
 * reads the ban table. */
const realEnv = () => ({ DB: createTestDb(), ADMIN_PASSCODE: 'test-only-admin-passcode' })

// The default env for the refusal tests: a database that throws if a gate is too slow.
const bannedEnv = { DB: tripwireDb, ADMIN_PASSCODE: 'not-a-real-hash' }

const call = (path, { method = 'GET', protocol = PROTOCOL_VALUE, body, env = bannedEnv } = {}) => {
  const headers = {}
  // Absent by default rather than set to null: a header present with no value and
  // a header missing entirely are different things to the Worker.
  if (protocol !== null) {
    headers[PROTOCOL_HEADER] = protocol
  }
  if (body !== undefined) {
    headers['content-type'] = 'application/json'
  }

  return worker.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  )
}

console.log('\nversion gate')

console.log('\n  refuses an archived build')
{
  // No header at all: exactly what every build under versions/ sends.
  const response = await call('/api/leaderboard', { protocol: null })
  const payload = await response.json()

  check('a request without the header is refused', response.status === 426, `got ${response.status}`)
  check(
    'the refusal explains the version is archived',
    typeof payload.error === 'string' && payload.error.toLowerCase().includes('archived'),
    JSON.stringify(payload),
  )
}

console.log('\n  refuses on every route, not just one')
{
  // The gate cannot be route-specific. If it missed one, that route would still
  // write to the database from an archived build, which is the whole problem.
  const routes = [
    ['/api/register', 'POST', { username: 'x', password: 'y' }],
    ['/api/login', 'POST', { username: 'x', password: 'y' }],
    ['/api/logout', 'POST'],
    ['/api/me', 'GET'],
    ['/api/me', 'PATCH', { displayName: 'x' }],
    ['/api/runs', 'POST', { rounds: [] }],
    ['/api/runs/1', 'DELETE'],
    ['/api/my-entries', 'GET'],
    ['/api/leaderboard', 'GET'],
    ['/api/submissions', 'POST', { runId: 1, videoUrl: 'x' }],
    ['/api/submissions/mine', 'GET'],
    ['/api/admin/accounts', 'GET'],
    ['/api/player-data', 'PUT', { x: 1 }],
    ['/api/redeem', 'POST', { code: 'x' }],
  ]

  for (const [path, method, body] of routes) {
    const response = await call(path, { method, protocol: null, body })
    check(
      `${method} ${path} is refused`,
      response.status === 426,
      `got ${response.status}`,
    )
  }
}

console.log('\n  refuses the previous protocol as archived')
{
  const response = await call('/api/leaderboard', { protocol: '1' })
  const payload = await response.json()

  check('the previous protocol is refused', response.status === 409, `got ${response.status}`)
  check('the previous protocol explains the archive refusal', /archived/i.test(payload.error ?? ''), JSON.stringify(payload))
}

console.log('\n  an unknown newer protocol is a different failure')
{
  // A build newer than the Worker: the deploy went out in the wrong order. That
  // deserves its own answer, so it does not look like every client going offline.
  const response = await call('/api/leaderboard', { protocol: '999' })
  const payload = await response.json()

  check('an unrecognised protocol is refused', response.status === 409, `got ${response.status}`)
  check('it names both versions', /999/.test(payload.error ?? ''), JSON.stringify(payload))
  check('it is not reported as an archived build', !/archived/i.test(payload.error ?? ''))
}

console.log('\n  admits the current build')
{
  const response = await call('/api/leaderboard', { env: realEnv() })
  // Past both gates: not 426 (archived) and not 409 (protocol mismatch). Reaching a
  // route at all is the assertion, since the tripwire database throws on first use.
  check(
    'the gate does not block a current build',
    response.status !== 426 && response.status !== 409 && response.status !== 403,
    `got ${response.status}`,
  )
}

console.log('\n  leaves the list endpoints open')
{
  // An archived build has to keep reading the level lists or it cannot play a run
  // at all, which is the one thing the archive is for. Those routes are not gated.
  const response = await call('/impossible-levels', { protocol: null, env: realEnv() })
  check('the list endpoints are not gated', response.status !== 426, `got ${response.status}`)
}
console.log('\n  the refusal is readable cross-origin')
{
  // The Worker is a third-party origin from GitHub Pages, so the browser will not
  // hand the archived build the message unless the response opts in. Without this
  // the refusal still happens, but the player sees an opaque network error.
  const response = await call('/api/leaderboard', { protocol: null })
  const allowed = response.headers.get('access-control-allow-headers') ?? ''
  check(
    'the gate header is allowed through the preflight',
    allowed.toLowerCase().includes(PROTOCOL_HEADER),
    allowed,
  )
  check('the origin is allowed', response.headers.get('access-control-allow-origin') === '*')
}

console.log(`\n${failed ? `FAILED ${failed}, ` : ''}${passed} passed\n`)
process.exit(failed ? 1 : 0)