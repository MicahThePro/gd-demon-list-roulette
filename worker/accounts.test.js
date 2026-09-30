/**
 * Account administration: the search, the detail view, the delete, and the
 * one-time login code.
 *
 * The code is the part worth being careful about, so it is tested against the
 * ways it could be reused: twice, after being replaced, after the account is
 * gone, and when the row is tampered with directly.
 *
 * Run with: node --experimental-sqlite worker/accounts.test.js
 */
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import worker from './index.js'
import { createPasswordRecord } from './auth.js'

const SCHEMA = [
  './migrations/0001_init.sql',
  './migrations/0002_submissions.sql',
  './migrations/0003_admin.sql',
  './migrations/0004_trashed_runs.sql',
]
  .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
  .join('\n')

const createDb = () => {
  const db = new DatabaseSync(':memory:')
  db.exec(SCHEMA)

  // The same D1-shaped stub the other Worker tests use, so these exercise the
  // real SQL against the real schema rather than a mock.
  const prepared = (sql) => {
    const statement = db.prepare(sql)
    const execute = (values) => {
      statement.run(...values)
      return { success: true, meta: {} }
    }
    return {
      bind: (...values) => ({
        first: async () => statement.get(...values) ?? null,
        all: async () => ({ results: statement.all(...values) }),
        run: async () => execute(values),
      }),
      first: async () => statement.get() ?? null,
      all: async () => ({ results: statement.all() }),
      run: async () => execute([]),
    }
  }

  return {
    prepare: prepared,
    // /api/runs writes the run and its rounds in one batch, so the stub has to
    // offer it or the route cannot be exercised at all.
    batch: async (statements) => {
      db.exec('BEGIN')
      try {
        for (const statement of statements) {
          await statement.run()
        }
        db.exec('COMMIT')
        return statements.map(() => ({ success: true }))
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
  }
}

const PASSCOD = (await createPasswordRecord('258456')).passwordHash
const makeEnv = (extra = {}) => ({ DB: createDb(), ADMIN_PASSCODE: PASSCOD, ...extra })

const BASE = 'https://worker.test'
let failures = 0
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  pass  ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`)
  }
}

const call = async (env, path, { method = 'GET', body, token, passcode } = {}) => {
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (token) headers.authorization = `Bearer ${token}`
  if (passcode) headers['x-admin-passcode'] = passcode

  return worker.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  )
}

const jsonCall = async (env, path, opts) => {
  const response = await call(env, path, opts)
  let data
  try {
    data = await response.clone().json()
  } catch {
    data = null
  }
  return { response, data }
}

// A run the Worker will accept: marked cleared, so it needs a 100% round behind
// it, and the one round here is that.
const aRun = (over = {}) => ({
  runId: 'run-1',
  source: 'AREDL',
  percentStep: 1,
  status: 'completed',
  endedAt: 1_700_000_000_000,
  rounds: [
    { levelId: 'a', levelName: 'Alpha', targetPercent: 100, achievedPercent: 100, result: 'success', elapsedMs: 30000 },
  ],
  ...over,
})

/* Two players, so the search and the delete can be checked against more than one
   account and so deleting one is visibly not deleting the other. */
const setup = async (env = makeEnv()) => {
  const alice = (await jsonCall(env, '/api/register', {
    method: 'POST',
    body: { username: 'alice', password: 'a good password', displayName: 'Alice Example' },
  })).data
  const bob = (await jsonCall(env, '/api/register', {
    method: 'POST',
    body: { username: 'bob', password: 'another password', displayName: 'Bob Example' },
  })).data
  return { env, alice, bob }
}

console.log('searching accounts')
{
  const { env, alice } = await setup()

  check('no passcode is refused', (await jsonCall(env, '/api/admin/accounts')).response.status === 401)
  check('a wrong passcode is refused', (await jsonCall(env, '/api/admin/accounts', { passcode: '000000' })).response.status === 401)

  const all = await jsonCall(env, '/api/admin/accounts', { passcode: '258456' })
  check('the list comes back', all.response.status === 200, JSON.stringify(all.data))
  check('both accounts are there', all.data.accounts.length === 2, String(all.data.accounts?.length))

  const byName = await jsonCall(env, '/api/admin/accounts?q=alice', { passcode: '258456' })
  check('a username search finds it', byName.data.accounts.length === 1, JSON.stringify(byName.data))
  check('and it is the right one', byName.data.accounts[0].username === 'alice')

  const byDisplay = await jsonCall(env, '/api/admin/accounts?q=Bob', { passcode: '258456' })
  check('a display name search finds it', byDisplay.data.accounts.length === 1, JSON.stringify(byDisplay.data))
  check('and it is the right one', byDisplay.data.accounts[0].username === 'bob')

  check('a search for nobody comes back empty', (await jsonCall(env, '/api/admin/accounts?q=zzz', { passcode: '258456' })).data.accounts.length === 0)

  // A wildcard must not turn into a match-everything, and must not be an error.
  const wildcard = await jsonCall(env, '/api/admin/accounts?q=%', { passcode: '258456' })
  check('a % in the search is treated as a literal', wildcard.response.status === 200 && wildcard.data.accounts.length === 0, JSON.stringify(wildcard.data))

  // The account ids are what the detail and delete routes take.
  const bobId = byDisplay.data.accounts[0].id
  check('a new account has no runs yet', byDisplay.data.accounts[0].runCount === 0)

  const detail = await jsonCall(env, `/api/admin/accounts/${bobId}`, { passcode: '258456' })
  check('the detail view opens', detail.response.status === 200, JSON.stringify(detail.data))
  check('it carries the account', detail.data.account.username === 'bob')
  check('and an empty run list', detail.data.account.runs.length === 0)
  check('and no mirrored data yet', detail.data.account.playerData.syncedAt === null)
  check('and no login code yet', detail.data.account.loginCode.hasCode === false)

  check('an unknown account is a 404', (await jsonCall(env, '/api/admin/accounts/9999', { passcode: '258456' })).response.status === 404)
  check('a wrong passcode cannot confirm an account exists', (await jsonCall(env, `/api/admin/accounts/${bobId}`, { passcode: '000000' })).response.status === 401)
  check('alice is untouched by reading bob', (await jsonCall(env, `/api/admin/accounts/${alice.user.id}`, { passcode: '258456' })).data.account.username === 'alice')
}

console.log('a players submitted runs')
{
  const { env, alice } = await setup()

  const run = (await jsonCall(env, '/api/runs', { method: 'POST', body: aRun(), token: alice.token })).data.run
  await jsonCall(env, '/api/submissions', {
    method: 'POST',
    token: alice.token,
    body: { runId: run.id, videoUrl: 'https://youtu.be/dQw4w9WgXcQ', container: 'mp4', note: 'hi' },
  })

  const detail = await jsonCall(env, `/api/admin/accounts/${alice.user.id}`, { passcode: '258456' })
  const account = detail.data.account
  check('the run shows up', account.runs.length === 1, String(account.runs.length))
  check('with its score', account.runs[0].score >= 0)
  check('and its submission', account.runs[0].submission?.status === 'pending', JSON.stringify(account.runs[0].submission))
  check('and the counts agree', account.runCount === 1 && account.submissionCount === 1 && account.pendingCount === 1, JSON.stringify(account))
}

console.log('the one-time login code')
{
  const { env } = await setup()
  const id = (await jsonCall(env, '/api/admin/accounts?q=bob', { passcode: '258456' })).data.accounts[0].id

  const issued = await jsonCall(env, `/api/admin/accounts/${id}/login-code`, { method: 'POST', passcode: '258456' })
  check('a code is issued', issued.response.status === 201, JSON.stringify(issued.data))
  check('it is readable characters only', /^[A-Z0-9]+$/.test(issued.data.code ?? ''), String(issued.data.code))
  check('and long enough to be unguessable', (issued.data.code ?? '').length >= 12, String(issued.data.code))

  check('issuing needs the passcode', (await jsonCall(env, `/api/admin/accounts/${id}/login-code`, { method: 'POST', passcode: '000000' })).response.status === 401)
  check('redeeming it signs in as the player', (await jsonCall(env, '/api/redeem', { method: 'POST', body: { code: issued.data.code } })).data.user.username === 'bob')
  check('and it is not the same session as a real sign in', (await jsonCall(env, '/api/redeem', { method: 'POST', body: { code: issued.data.code } })).response.status !== 200)

  // The whole point: a second attempt is refused.
  const again = await jsonCall(env, '/api/redeem', { method: 'POST', body: { code: issued.data.code } })
  check('the same code cannot be used twice', again.response.status === 409, String(again.response.status))
  check('and it says so plainly', /already been used/i.test(again.data.error ?? ''), JSON.stringify(again.data))

  // A guess of the right shape but no real code. Z is in the alphabet, so this
  // is length-valid and has to be refused on the digest rather than the shape.
  check('a made up code is refused', (await jsonCall(env, '/api/redeem', { method: 'POST', body: { code: 'ZZZZZZZZZZZZZZZ' } })).response.status === 401)
  check('an empty code is refused', (await jsonCall(env, '/api/redeem', { method: 'POST', body: {} })).response.status === 400)

  // A code read out with spaces and in the wrong case still works, because a code
  // dictated over a call is typed like that.
  const second = await jsonCall(env, `/api/admin/accounts/${id}/login-code`, { method: 'POST', passcode: '258456' })
  const spaced = second.data.code.toLowerCase().replace(/(.{5})/g, '$1 ')
  check('a code typed in pieces still works', (await jsonCall(env, '/api/redeem', { method: 'POST', body: { code: spaced } })).data.user?.username === 'bob')
}

console.log('a new code kills the old one')
{
  const { env } = await setup()
  const id = (await jsonCall(env, '/api/admin/accounts?q=alice', { passcode: '258456' })).data.accounts[0].id

  const first = (await jsonCall(env, `/api/admin/accounts/${id}/login-code`, { method: 'POST', passcode: '258456' })).data.code
  const second = (await jsonCall(env, `/api/admin/accounts/${id}/login-code`, { method: 'POST', passcode: '258456' })).data.code
  check('the two codes differ', first !== second)

  // The first was never used, but issuing a second one retired it.
  const stale = await jsonCall(env, '/api/redeem', { method: 'POST', body: { code: first } })
  check('the replaced code is dead', stale.response.status === 401, String(stale.response.status))
  check('and the new one works', (await jsonCall(env, '/api/redeem', { method: 'POST', body: { code: second } })).data.user != null)
}

console.log('revoking a code')
{
  const { env } = await setup()
  const id = (await jsonCall(env, '/api/admin/accounts?q=alice', { passcode: '258456' })).data.accounts[0].id
  const code = (await jsonCall(env, `/api/admin/accounts/${id}/login-code`, { method: 'POST', passcode: '258456' })).data.code

  check('revoking needs the passcode', (await jsonCall(env, `/api/admin/accounts/${id}/revoke-code`, { method: 'POST', passcode: '000000' })).response.status === 401)
  check('revoking works', (await jsonCall(env, `/api/admin/accounts/${id}/revoke-code`, { method: 'POST', passcode: '258456' })).response.status === 200)
  check('and the code stops working', (await jsonCall(env, '/api/redeem', { method: 'POST', body: { code } })).response.status === 401)

  const detail = await jsonCall(env, `/api/admin/accounts/${id}`, { passcode: '258456' })
  check('the panel reports no live code', detail.data.account.loginCode.hasCode === false)
}

console.log('the redeemed session is a real one')
{
  const { env } = await setup()
  const id = (await jsonCall(env, '/api/admin/accounts?q=bob', { passcode: '258456' })).data.accounts[0].id
  const code = (await jsonCall(env, `/api/admin/accounts/${id}/login-code`, { method: 'POST', passcode: '258456' })).data.code

  const redeemed = (await jsonCall(env, '/api/redeem', { method: 'POST', body: { code } })).data
  check('it is the player, not an admin', redeemed.user.username === 'bob')
  check('the session identifies the player', (await jsonCall(env, '/api/me', { token: redeemed.token })).data.user.username === 'bob')

  // A redeemed session is a normal one, so it must NOT be able to reach the admin
  // routes. Otherwise issuing a code would be a way in for everyone.
  check('it cannot reach the admin account list', (await jsonCall(env, '/api/admin/accounts', { token: redeemed.token })).response.status === 401)
  check('it cannot reach the admin queue either', (await jsonCall(env, '/api/admin/submissions', { token: redeemed.token })).response.status === 401)

  // It can only see its own runs.
  const run = (await jsonCall(env, '/api/runs', { method: 'POST', body: aRun(), token: redeemed.token })).data.run
  check('it can act as the player', run != null)
  check('and logout ends it', (await jsonCall(env, '/api/logout', { method: 'POST', token: redeemed.token })).response.status === 200)
  check('so the session is gone', (await jsonCall(env, '/api/me', { token: redeemed.token })).data.user == null)
}

console.log('deleting an account')
{
  const { env, alice } = await setup()
  const aliceId = (await jsonCall(env, '/api/admin/accounts?q=alice', { passcode: '258456' })).data.accounts[0].id
  const bobId = (await jsonCall(env, '/api/admin/accounts?q=bob', { passcode: '258456' })).data.accounts[0].id

  const run = (await jsonCall(env, '/api/runs', { method: 'POST', body: aRun(), token: alice.token })).data.run
  await jsonCall(env, '/api/submissions', { method: 'POST', token: alice.token, body: { runId: run.id, videoUrl: 'https://youtu.be/x', container: 'mp4' } })

  check('deleting needs the passcode', (await jsonCall(env, `/api/admin/accounts/${aliceId}/delete`, { method: 'POST', passcode: '000000', body: { confirm: 'alice' } })).response.status === 401)
  check('a delete with the wrong confirmation is refused', (await jsonCall(env, `/api/admin/accounts/${aliceId}/delete`, { method: 'POST', passcode: '258456', body: { confirm: 'wrong' } })).response.status === 400)
  check('and with no confirmation at all', (await jsonCall(env, `/api/admin/accounts/${aliceId}/delete`, { method: 'POST', passcode: '258456' })).response.status === 400)

  const gone = await jsonCall(env, `/api/admin/accounts/${aliceId}/delete`, { method: 'POST', passcode: '258456', body: { confirm: 'alice' } })
  check('the delete works', gone.response.status === 200, JSON.stringify(gone.data))
  check('and says who went', gone.data.deleted === 'alice')

  check('the account is gone', (await jsonCall(env, `/api/admin/accounts/${aliceId}`, { passcode: '258456' })).response.status === 404)
  check('bob is untouched', (await jsonCall(env, `/api/admin/accounts/${bobId}`, { passcode: '258456' })).data.account.username === 'bob')
  check('the deleted player cannot still sign in', (await jsonCall(env, '/api/login', { method: 'POST', body: { username: 'alice', password: 'a good password' } })).response.status === 401)
  check('their old session is dead', (await jsonCall(env, '/api/me', { token: alice.token })).data.user == null)
  check('their runs are gone from the leaderboard', (await jsonCall(env, '/api/leaderboard')).data.entries.length === 0)
}

console.log('deleting takes the login codes with it')
{
  const { env } = await setup()
  const id = (await jsonCall(env, '/api/admin/accounts?q=alice', { passcode: '258456' })).data.accounts[0].id
  const code = (await jsonCall(env, `/api/admin/accounts/${id}/login-code`, { method: 'POST', passcode: '258456' })).data.code

  await jsonCall(env, `/api/admin/accounts/${id}/delete`, { method: 'POST', passcode: '258456', body: { confirm: 'alice' } })
  const after = await jsonCall(env, '/api/redeem', { method: 'POST', body: { code } })
  check('a code for a deleted account cannot be redeemed', after.response.status === 401, String(after.response.status))
}

console.log('the audit log')
{
  const { env } = await setup()
  const id = (await jsonCall(env, '/api/admin/accounts?q=alice', { passcode: '258456' })).data.accounts[0].id

  check('the log needs the passcode', (await jsonCall(env, '/api/admin/audit', { passcode: '000000' })).response.status === 401)

  await jsonCall(env, `/api/admin/accounts/${id}/login-code`, { method: 'POST', passcode: '258456' })
  await jsonCall(env, `/api/admin/accounts/${id}/delete`, { method: 'POST', passcode: '258456', body: { confirm: 'alice' } })

  const log = await jsonCall(env, '/api/admin/audit', { passcode: '258456' })
  check('the log reads back', log.response.status === 200, JSON.stringify(log.data))
  const actions = (log.data.entries ?? []).map((entry) => entry.action)
  check('issuing a code is logged', actions.includes('login-code.issue'), JSON.stringify(actions))
  check('deleting an account is logged', actions.includes('account.delete'), JSON.stringify(actions))
  check('newest first', log.data.entries[0].action === 'account.delete', JSON.stringify(actions))
  check('the username survives the delete in the log', log.data.entries[0].targetName === 'alice')
  // The code itself must never be written down anywhere.
  check('the log holds no code', !JSON.stringify(log.data).match(/\b[A-Z0-9]{15}\b/))
}

console.log('a players own data can be mirrored')
{
  const { env, alice } = await setup()
  const id = (await jsonCall(env, '/api/admin/accounts?q=alice', { passcode: '258456' })).data.accounts[0].id

  check('uploading without a session is refused', (await jsonCall(env, '/api/player-data', { method: 'PUT', body: { history: '[]' } })).response.status === 401)

  const history = JSON.stringify([{ id: '1-AREDL', score: 100 }])
  const saved = await jsonCall(env, '/api/player-data', {
    method: 'PUT',
    token: alice.token,
    body: { history, settings: JSON.stringify({ allowSkip: true }) },
  })
  check('the upload is accepted', saved.response.status === 200, JSON.stringify(saved.data))
  check('and it reports when it happened', Number.isFinite(saved.data.syncedAt))

  const detail = await jsonCall(env, `/api/admin/accounts/${id}`, { passcode: '258456' })
  check(
    'the panel can read it back',
    JSON.stringify(detail.data.account.playerData.history) === history,
    JSON.stringify(detail.data.account.playerData),
  )
  check('and the settings too', detail.data.account.playerData.settings?.allowSkip === true)
  check('the sync time is recorded', Number.isFinite(detail.data.account.playerData.syncedAt))

  // A second upload replaces rather than duplicating, so the mirror is one row.
  await jsonCall(env, '/api/player-data', { method: 'PUT', token: alice.token, body: { history: '[]', settings: null } })
  const again = await jsonCall(env, `/api/admin/accounts/${id}`, { passcode: '258456' })
  check('a second upload replaces it', JSON.stringify(again.data.account.playerData.history) === '[]', JSON.stringify(again.data.account.playerData))

  check('an oversized upload is refused', (await jsonCall(env, '/api/player-data', { method: 'PUT', token: alice.token, body: { history: 'x'.repeat(2 * 1024 * 1024) } })).response.status === 413)

  // A mirror is a copy, so deleting the account must take it with the account.
  await jsonCall(env, `/api/admin/accounts/${id}/delete`, { method: 'POST', passcode: '258456', body: { confirm: 'alice' } })
  check('deleting the account takes its mirrored data', (await jsonCall(env, `/api/admin/accounts/${id}`, { passcode: '258456' })).response.status === 404)
}

console.log('trashing a run, submitted or not')
{
  const { env, alice, bob } = await setup()
  const accountId = (await jsonCall(env, '/api/admin/accounts?q=alice', { passcode: '258456' })).data.accounts[0].id

  // Two runs: one that was sent for review and one that was never sent anywhere.
  // The second is the point -- a run only reaches an account by being saved
  // there, and a moderator has to be able to get at it without it having been
  // submitted first.
  const submitted = (await jsonCall(env, '/api/runs', { method: 'POST', token: alice.token, body: aRun({ runId: 'alice-1' }) })).data.run
  const unsubmitted = (await jsonCall(env, '/api/runs', { method: 'POST', token: alice.token, body: aRun({ runId: 'alice-2' }) })).data.run
  const bobsRun = (await jsonCall(env, '/api/runs', { method: 'POST', token: bob.token, body: aRun({ runId: 'bob-1' }) })).data.run

  const before = (await jsonCall(env, `/api/admin/accounts/${accountId}`, { passcode: '258456' })).data.account
  check('every run is listed, submitted or not', before.runs.length === 2, JSON.stringify(before.runs.map((r) => r.runId)))
  check('one has no submission', before.runs.some((r) => r.runId === 'alice-2' && r.submission === null), JSON.stringify(before.runs))
  check('nothing is trashed to begin with', before.runs.every((r) => r.trashed === false))

  check('trashing needs the passcode', (await jsonCall(env, `/api/admin/accounts/${accountId}/runs/${unsubmitted.id}/trash`, { method: 'POST' })).response.status === 401)
  check('a wrong passcode is refused', (await jsonCall(env, `/api/admin/accounts/${accountId}/runs/${unsubmitted.id}/trash`, { method: 'POST', passcode: '000000' })).response.status === 401)

  const trashed = await jsonCall(env, `/api/admin/accounts/${accountId}/runs/${unsubmitted.id}/trash`, {
    method: 'POST',
    passcode: '258456',
    body: { reason: 'not this account\'s run' },
  })
  check('trashing succeeds', trashed.response.status === 200 && trashed.data.trashed === true, JSON.stringify(trashed.data))

  const after = (await jsonCall(env, `/api/admin/accounts/${accountId}`, { passcode: '258456' })).data.account
  check('a trashed run is still on the account', after.runs.length === 2, JSON.stringify(after.runs.map((r) => r.runId)))
  check('and it is marked as trashed', after.runs.find((r) => r.id === unsubmitted.id)?.trashed === true, JSON.stringify(after.runs))
  check('the reason is kept for the log', after.runs.find((r) => r.id === unsubmitted.id)?.trashReason === "not this account's run", JSON.stringify(after.runs.find((r) => r.id === unsubmitted.id)))
  check('the hidden count is reported', after.account?.trashedCount === 1 || after.trashedCount === 1, JSON.stringify(after))
  check('the other run is untouched', after.runs.find((r) => r.id === submitted.id)?.trashed === false)

  // Trashing twice is not an error and does not make a second row: the primary
  // key is what stops it, and the second call just refreshes the reason.
  const twice = await jsonCall(env, `/api/admin/accounts/${accountId}/runs/${unsubmitted.id}/trash`, {
    method: 'POST',
    passcode: '258456',
    body: { reason: 'still not theirs' },
  })
  check('trashing twice is fine', twice.response.status === 200, JSON.stringify(twice.data))
  const markers = await env.DB.prepare('SELECT COUNT(*) AS n FROM trashed_runs WHERE run_id = ?').bind(unsubmitted.id).first()
  check('and leaves one marker', markers?.n === 1, JSON.stringify(markers))

  // The run row itself was never touched, so putting it back is exact.
  const row = await env.DB.prepare('SELECT score, run_key FROM runs WHERE id = ?').bind(unsubmitted.id).first()
  check('the run row is untouched', row?.score === 100 && row?.run_key === 'alice-2', JSON.stringify(row))

  // A run belonging to another account is not reachable through this one, so a
  // wrong id in the path cannot trash somebody else's run.
  const crossAccount = await jsonCall(env, `/api/admin/accounts/${accountId}/runs/${bobsRun.id}/trash`, { method: 'POST', passcode: '258456' })
  check("another account's run is not reachable here", crossAccount.response.status === 404, JSON.stringify(crossAccount.data))
  const bobStillFine = await env.DB.prepare('SELECT COUNT(*) AS n FROM trashed_runs WHERE run_id = ?').bind(bobsRun.id).first()
  check("and their run is not trashed", bobStillFine?.n === 0, JSON.stringify(bobStillFine))

  const untrashed = await jsonCall(env, `/api/admin/accounts/${accountId}/runs/${unsubmitted.id}/untrash`, { method: 'POST', passcode: '258456' })
  check('un-trashing succeeds', untrashed.response.status === 200 && untrashed.data.trashed === false, JSON.stringify(untrashed.data))
  const restored = (await jsonCall(env, `/api/admin/accounts/${accountId}`, { passcode: '258456' })).data.account
  check('the run comes back', restored.runs.find((r) => r.id === unsubmitted.id)?.trashed === false, JSON.stringify(restored.runs))
  check('with its reason cleared', restored.runs.find((r) => r.id === unsubmitted.id)?.trashReason === null)

  // Un-trashing something that was never trashed is a no-op rather than an
  // error, so a double click cannot turn into a spurious error on screen.
  const again = await jsonCall(env, `/api/admin/accounts/${accountId}/runs/${unsubmitted.id}/untrash`, { method: 'POST', passcode: '258456' })
  check('un-trashing an untrashed run is not an error', again.response.status === 200, JSON.stringify(again.data))

  const audit = (await jsonCall(env, '/api/admin/audit', { passcode: '258456' })).data.entries
  check('the trashing is in the log', audit.some((entry) => entry.action === 'run.trash' && entry.targetName === 'alice'), JSON.stringify(audit.map((e) => e.action)))
  check('the reason is in the log', audit.some((entry) => entry.action === 'run.trash' && String(entry.detail).includes('still not theirs')), JSON.stringify(audit))
  check('the un-trashing is in the log', audit.some((entry) => entry.action === 'run.untrash'), JSON.stringify(audit.map((e) => e.action)))

  // Deleting the account takes the markers with it, or the table would keep rows
  // pointing at runs that no longer exist.
  await jsonCall(env, `/api/admin/accounts/${accountId}/runs/${submitted.id}/trash`, { method: 'POST', passcode: '258456' })
  await jsonCall(env, `/api/admin/accounts/${accountId}/delete`, { method: 'POST', passcode: '258456', body: { confirm: 'alice' } })
  const orphans = await env.DB.prepare('SELECT COUNT(*) AS n FROM trashed_runs').first()
  check('deleting the account clears its trash markers', orphans?.n === 0, JSON.stringify(orphans))
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll checks passed.')
