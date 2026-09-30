/**
 * End-to-end check for the Worker's accounts and leaderboard API.
 *
 * Wrangler itself cannot run in this environment, so the Worker is imported
 * directly and given a D1-shaped shim over node:sqlite. That exercises the real
 * request handler, the real SQL and the real password hashing, so what is
 * verified here is the code that ships rather than a mock of it.
 *
 * Run with:  node --experimental-sqlite worker/api.test.js
 */
// The eslint config targets the browser, so the test file's own globals are
// declared here rather than by loosening the config for every other file.
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import worker from './index.js'

// Both migrations, because the leaderboard now reads the submissions table to
// decide which runs have been vetted. Loading only the first would leave the
// board querying a table that does not exist.
const SCHEMA = ['./migrations/0001_init.sql', './migrations/0002_submissions.sql']
  .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
  .join('\n')

/* The slice of the D1 API the Worker uses: prepare/bind/first/all/run/batch.
   `run` has to actually execute, since that is how every INSERT and DELETE in
   the Worker reaches the database. */
const createDb = () => {
  const db = new DatabaseSync(':memory:')
  db.exec(SCHEMA)

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
    batch: async (statements) => {
      db.exec('BEGIN')
      try {
        for (const statement of statements) {
          await statement.run()
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return statements.map(() => ({ success: true }))
    },
  }
}

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

const call = (env, path, { method = 'GET', body, token, cookie } = {}) => {
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (token) headers.authorization = `Bearer ${token}`
  if (cookie) headers.cookie = cookie

  return worker.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  )
}

const post = async (env, path, body, token) => {
  const response = await call(env, path, { method: 'POST', body, token })
  return { response, data: await response.json() }
}

const aRun = (over = {}) => ({
  runId: 'run-1',
  source: 'AREDL',
  percentStep: 1,
  status: 'failed',
  endedAt: 1_700_000_000_000,
  rounds: [
    { levelId: 'a', levelName: 'A', targetPercent: 1, achievedPercent: 1, result: 'success', elapsedMs: 30000 },
    { levelId: 'b', levelName: 'B', targetPercent: 2, achievedPercent: 2, result: 'success', elapsedMs: 45000 },
    { levelId: 'c', levelName: 'C', targetPercent: 3, achievedPercent: 1, result: 'failure', elapsedMs: 20000 },
  ],
  ...over,
})

console.log('registration and sessions')
{
  const env = { DB: createDb() }

  const weak = await post(env, '/api/register', { username: 'ab', password: 'longenough1' })
  check('short username is rejected', weak.response.status === 400, JSON.stringify(weak.data))

  const weakPass = await post(env, '/api/register', { username: 'playerone', password: 'short' })
  check('short password is rejected', weakPass.response.status === 400)

  const created = await post(env, '/api/register', {
    username: 'Player_One',
    password: 'correct horse',
    displayName: 'Player One',
  })
  check('register succeeds', created.response.status === 201, JSON.stringify(created.data))
  check('username is lowercased', created.data.user?.username === 'player_one', created.data.user?.username)
  check('a session token is returned', typeof created.data.token === 'string' && created.data.token.length === 64)
  const cookie = created.response.headers.get('set-cookie') ?? ''
  check('a session cookie is set', cookie.includes('dlr_session=') && cookie.includes('SameSite=Lax'))
  check('the cookie is marked Secure', cookie.includes('Secure'))

  const dupe = await post(env, '/api/register', { username: 'player_one', password: 'another one' })
  check('a taken username is rejected', dupe.response.status === 409, JSON.stringify(dupe.data))

  const me = await call(env, '/api/me', { token: created.data.token })
  check('the token identifies the player', (await me.json())?.user?.username === 'player_one')

  const badLogin = await post(env, '/api/login', { username: 'player_one', password: 'wrong' })
  check('a wrong password is rejected', badLogin.response.status === 401)

  const noUser = await post(env, '/api/login', { username: 'ghost', password: 'whatever' })
  check(
    'an unknown username gives the same message as a wrong password',
    noUser.data.error === badLogin.data.error,
  )

  const goodLogin = await post(env, '/api/login', { username: 'player_one', password: 'correct horse' })
  check('sign in works', goodLogin.response.status === 200)
  check(
    'signing in again issues a different token',
    goodLogin.data.token !== created.data.token,
  )

  const noToken = await call(env, '/api/me')
  check('no token means signed out', (await noToken.json())?.user === null)

  await call(env, '/api/logout', { method: 'POST', token: goodLogin.data.token })
  const afterLogout = await call(env, '/api/me', { token: goodLogin.data.token })
  check('the token is dead after signing out', (await afterLogout.json())?.user === null)
}

console.log('failures explain themselves')
{
  // Every rejected request has to carry a message. A bare status code gives the
  // form nothing to display, so a wrong password looks like the app ignoring
  // the user rather than rejecting what they typed.
  const env = { DB: createDb() }
  const created = await post(env, '/api/register', { username: 'speaker', password: 'the right password' })

  const cases = [
    ['a wrong password', '/api/login', { username: 'speaker', password: 'the wrong password' }, false],
    ['an unknown username', '/api/login', { username: 'nobody', password: 'anything at all' }, false],
    ['a short username', '/api/register', { username: 'ab', password: 'long enough one' }, false],
    ['a short password', '/api/register', { username: 'newcomer', password: 'tiny' }, false],
    ['a taken username', '/api/register', { username: 'speaker', password: 'a different one' }, true],
    ['an unknown list on a run', '/api/runs', aRun({ source: 'Made Up List' }), true],
    ['a run with no rounds', '/api/runs', aRun({ rounds: [] }), true],
    ['a run cleared with no 100% round', '/api/runs', aRun({ status: 'completed' }), true],
  ]

  for (const [name, path, body, needsAuth] of cases) {
    const result = await post(env, path, body, needsAuth ? created.data.token : undefined)
    const message = result.data.error
    check(
      `${name} is rejected with a message`,
      result.response.status >= 400 && typeof message === 'string' && message.length > 0,
      `status ${result.response.status}, body ${JSON.stringify(result.data)}`,
    )
  }

  // A successful call must never carry an error field, or a client that shows
  // whatever is in error would report a failure on success.
  const ok = await post(env, '/api/login', { username: 'speaker', password: 'the right password' })
  check('a successful sign in carries no error', ok.data.error === undefined, JSON.stringify(ok.data).slice(0, 80))

  // The wrong password has to say so in a way that does not confirm the
  // account exists.
  const wrongPassword = await post(env, '/api/login', { username: 'speaker', password: 'nope nope nope' })
  const unknownUser = await post(env, '/api/login', { username: 'ghost', password: 'nope nope nope' })
  check('a wrong password and an unknown user are worded identically', wrongPassword.data.error === unknownUser.data.error)
}

console.log('run submission is validated, not trusted')
{
  const env = { DB: createDb() }
  const auth = (await post(env, '/api/register', { username: 'submitter', password: 'a good password' })).data

  const anonymous = await post(env, '/api/runs', aRun())
  check('submitting without a token is refused', anonymous.response.status === 401)

  const unknownSource = await post(env, '/api/runs', aRun({ source: 'My Own List' }), auth.token)
  check('an unknown list is refused', unknownSource.response.status === 400, JSON.stringify(unknownSource.data))

  const badResult = await post(
    env,
    '/api/runs',
    aRun({
      rounds: [{ levelId: 'a', levelName: 'A', targetPercent: 1, achievedPercent: 1, result: 'hacked', elapsedMs: 1 }],
    }),
    auth.token,
  )
  check('an unknown round result is refused', badResult.response.status === 400)

  // A run whose highest round is 61% cannot claim to be cleared.
  const fakeClear = await post(
    env,
    '/api/runs',
    aRun({
      status: 'completed',
      rounds: [{ levelId: 'a', levelName: 'A', targetPercent: 61, achievedPercent: 61, result: 'success', elapsedMs: 1000 }],
    }),
    auth.token,
  )
  check('a cleared run with no 100% round is refused', fakeClear.response.status === 400, JSON.stringify(fakeClear.data))

  // A run with a real 100% round behind it is accepted, and scores 100 no
  // matter what summary the client attached to it.
  const realClear = await post(
    env,
    '/api/runs',
    aRun({
      runId: 'run-clear',
      status: 'completed',
      rounds: [
        { levelId: 'a', levelName: 'A', targetPercent: 99, achievedPercent: 100, result: 'success', elapsedMs: 1000 },
      ],
    }),
    auth.token,
  )
  check('a genuinely cleared run is accepted', realClear.response.status === 201, JSON.stringify(realClear.data))
  check('a cleared run scores 100', realClear.data.run?.score === 100, String(realClear.data.run?.score))
  check('the response does not echo the rounds back', realClear.data.run?.rounds === undefined)

  // The rounds are re-derived on the server, so a summary claiming 100 is
  // simply ignored rather than stored.
  const inflated = await post(env, '/api/runs', aRun({ score: 100, targetReached: 100 }), auth.token)
  check('an inflated summary score is ignored', inflated.data.run?.score === 3, String(inflated.data.run?.score))

  const ok = await post(env, '/api/runs', aRun(), auth.token)
  check('a real run submits', ok.response.status === 201, JSON.stringify(ok.data))
  check('the score is derived from the rounds', ok.data.run?.score === 3, String(ok.data.run?.score))
  check('cleared rounds are counted', ok.data.run?.passed === 2, String(ok.data.run?.passed))
  check('rounds played is counted', ok.data.run?.roundsPlayed === 3)
  check('total time is summed', ok.data.run?.totalMs === 95000, String(ok.data.run?.totalMs))
  check('the average is computed', ok.data.run?.avgMs === 31667, String(ok.data.run?.avgMs))

  const again = await post(env, '/api/runs', aRun(), auth.token)
  check('resubmitting the same run id is allowed', again.response.status === 201)
  check('resubmitting returns the same row rather than a new one', again.data.run?.id === ok.data.run?.id)

  const mine = await call(env, '/api/runs', { token: auth.token })
  const runs = (await mine.json())?.runs ?? []
  // Only counting the runs sharing the resubmitted id. The block above also
  // submits a cleared run under a different one, so a plain length check would
  // be counting that too.
  const sameId = runs.filter((entry) => entry.runKey === 'run-1')
  check('resubmitting replaced rather than duplicated', sameId.length === 1, `got ${sameId.length}`)
  check('the stored rounds are attached', sameId[0]?.roundsPlayed === 3, String(sameId[0]?.roundsPlayed))

  const giveUp = await post(
    env,
    '/api/runs',
    aRun({
      runId: 'run-giveup',
      status: 'gaveup',
      rounds: [
        { levelId: 'a', levelName: 'A', targetPercent: 1, achievedPercent: 1, result: 'success', elapsedMs: 1000 },
        { levelId: 'b', levelName: 'B', targetPercent: 2, achievedPercent: null, result: 'gaveup', elapsedMs: 5000 },
      ],
    }),
    auth.token,
  )
  check('a give-up run submits', giveUp.response.status === 201)

  const skipped = await post(
    env,
    '/api/runs',
    aRun({
      runId: 'run-skip',
      rounds: [
        { levelId: 'a', levelName: 'A', targetPercent: 1, achievedPercent: null, result: 'skipped', skipReason: 'too-hard', elapsedMs: 100 },
        { levelId: 'b', levelName: 'B', targetPercent: 1, achievedPercent: 1, result: 'success', elapsedMs: 100 },
      ],
    }),
    auth.token,
  )
  check('a run with a skip submits', skipped.response.status === 201)
  check('the skip reason tally is kept', JSON.stringify(skipped.data.run?.skipReasons) === '{"too-hard":1}', JSON.stringify(skipped.data.run?.skipReasons))

  const badReason = await post(
    env,
    '/api/runs',
    aRun({
      runId: 'run-bad-reason',
      rounds: [{ levelId: 'a', levelName: 'A', targetPercent: 1, achievedPercent: null, result: 'skipped', skipReason: 'invented', elapsedMs: 1 }],
    }),
    auth.token,
  )
  check('an invented skip reason is refused', badReason.response.status === 400)
}

console.log('deleting a run only touches your own')
{
  const env = { DB: createDb() }
  const one = (await post(env, '/api/register', { username: 'one', password: 'a good password' })).data
  const two = (await post(env, '/api/register', { username: 'two', password: 'a good password' })).data
  const mine = await post(env, '/api/runs', aRun({ runId: 'mine' }), one.token)
  const theirs = await post(env, '/api/runs', aRun({ runId: 'theirs' }), two.token)

  await call(env, `/api/runs/${theirs.data.run.id}`, { method: 'DELETE', token: one.token })
  const survivors = (await (await call(env, '/api/runs', { token: two.token })).json())?.runs ?? []
  check("another player cannot delete your run", survivors.length === 1, `got ${survivors.length}`)

  await call(env, `/api/runs/${mine.data.run.id}`, { method: 'DELETE', token: one.token })
  const gone = (await (await call(env, '/api/runs', { token: one.token })).json())?.runs ?? []
  check('your own run deletes', gone.length === 0)
}

console.log('global leaderboard')
{
  const env = { DB: createDb() }
  const a = (await post(env, '/api/register', { username: 'alpha', password: 'a good password', displayName: 'Alpha' })).data
  const b = (await post(env, '/api/register', { username: 'bravo', password: 'a good password', displayName: 'Bravo' })).data

  const board = await call(env, '/api/leaderboard')
  check('an empty board reads without a token', board.status === 200, String(board.status))
  check('an empty board has no entries', (await board.json()).entries.length === 0)

  // The board only holds runs whose recording has been approved, so both runs
  // need one before they show up. This is the whole point of the review step:
  // an unvouched-for score never reaches the public board.
  const approveRun = async (runId) => {
    await env.DB
      .prepare(
        `INSERT INTO submissions (run_id, video_url, container, note, created_at, status)
         VALUES (?, ?, 'webm', NULL, 1, 'approved')`,
      )
      .bind(runId, `https://example.com/proof-${runId}.mp4`)
      .run()
  }

  const clearedRun = await post(
    env,
    '/api/runs',
    aRun({
      runId: 'a-clear',
      status: 'completed',
      percentStep: 20,
      rounds: [
        { levelId: 'x', levelName: 'X', targetPercent: 20, achievedPercent: 100, result: 'success', elapsedMs: 90000 },
      ],
    }),
    a.token,
  )
  const stoppedRun = await post(
    env,
    '/api/runs',
    aRun({
      runId: 'b-fail',
      source: 'Challenge List',
      rounds: [
        { levelId: 'y', levelName: 'Y', targetPercent: 39, achievedPercent: 39, result: 'success', elapsedMs: 120000 },
        { levelId: 'z', levelName: 'Z', targetPercent: 40, achievedPercent: 12, result: 'failure', elapsedMs: 60000 },
      ],
    }),
    b.token,
  )

  // Both are stored but neither is approved, so the board stays empty.
  const unvouched = (await (await call(env, '/api/leaderboard')).json())
  check('a run with no approved recording is not on the board', unvouched.entries.length === 0, JSON.stringify(unvouched.entries))

  await approveRun(clearedRun.data.run.id)
  const oneApproved = (await (await call(env, '/api/leaderboard')).json())
  check('only the approved run is on the board', oneApproved.entries.length === 1, JSON.stringify(oneApproved.entries.map((e) => e.displayName)))

  await approveRun(stoppedRun.data.run.id)

  const farthest = (await (await call(env, '/api/leaderboard')).json())
  check('the cleared run is first', farthest.entries[0]?.displayName === 'Alpha', JSON.stringify(farthest.entries.map((e) => e.displayName)))
  check('the cleared run scores 100', farthest.entries[0]?.score === 100)
  check('the stopped run scores its own rounds', farthest.entries[1]?.score === 40, String(farthest.entries[1]?.score))
  check('ranks are one-based', farthest.entries[0]?.rank === 1 && farthest.entries[1]?.rank === 2)

  const levels = (await (await call(env, '/api/leaderboard?board=levels')).json())
  check('the levels board is ordered by levels cleared', levels.board === 'levels')

  const fastest = (await (await call(env, '/api/leaderboard?board=fastest')).json())
  check('the fastest board is ordered by time', fastest.entries[0]?.totalMs === 90000, String(fastest.entries[0]?.totalMs))

  const filtered = (await (await call(env, '/api/leaderboard?source=Challenge%20List')).json())
  check('filtering by list works', filtered.entries.length === 1 && filtered.entries[0].displayName === 'Bravo')
  check('the filtered board reports its source', filtered.source === 'Challenge List')

  const unknownBoard = (await (await call(env, '/api/leaderboard?board=nonsense')).json())
  check('an unknown board falls back to the default', unknownBoard.board === 'farthest')

  const asPlayer = (await (await call(env, '/api/leaderboard', { token: b.token })).json())
  check('a signed-in player gets their standing', asPlayer.you?.rank === 2, JSON.stringify(asPlayer.you))
  check('a signed-in player gets their totals', asPlayer.personal?.runs === 1, JSON.stringify(asPlayer.personal))

  const asAnonymous = (await (await call(env, '/api/leaderboard')).json())
  check('an anonymous reader gets no personal standing', asAnonymous.you === null)

  const top = (await (await call(env, '/api/leaderboard?board=farthest&token=x')).json())
  check('a junk board parameter is ignored', top.board === 'farthest')
}

console.log('the list proxy still works')
{
  const env = { DB: createDb() }
  const missing = await call(env, '/api/nope')
  check('an unknown endpoint is a 404', missing.status === 404, String(missing.status))

  const rate = await call(env, '/impossible-level-rate?id=abc')
  check('the rate route still validates its id', rate.status === 400, String(rate.status))

  const unknownList = await call(env, '/nope')
  check('an unknown list still 404s with the available ones', unknownList.status === 404)
  const payload = await unknownList.json()
  check('the list routes are still advertised', payload.available?.includes('challenge-list'))

  const noDb = await call({}, '/api/me')
  check('a missing D1 binding explains itself', noDb.status === 503, String(noDb.status))
  check('the message names the problem', (await noDb.json()).error.includes('database'))
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
