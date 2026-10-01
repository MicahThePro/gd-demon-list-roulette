import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * Deleting a run has to delete it on the account, not just on screen.
 *
 * The board a signed-in player sees is the account's, and the app re-reads that
 * account on an interval and on every sign in. A delete that only filtered the
 * local copy therefore put the run straight back on the next read, which reads as
 * a button that does nothing -- and the run is then one the player can count, see
 * the total of, and never remove.
 *
 * The two ids are the trap. The board's own `id` is the run key the client minted,
 * a string like "1700000-AREDL". `serverId` is the number the server knows the run
 * by, and DELETE /api/runs/:id wants that number. Sending the key deletes nothing
 * and still reports success.
 */

/* The browser's storage and the Worker's, stood in for. Both are module-level in
   the modules under test, so the globals go in before those are imported, which is
   why the import below is dynamic. */
const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
}

const requests = []
let failNextDelete = false
globalThis.fetch = async (url, options = {}) => {
  requests.push({ url, method: options.method ?? 'GET' })
  if (options.method === 'DELETE' && failNextDelete) {
    return { ok: false, status: 500, json: async () => ({ error: 'Server said no' }) }
  }
  return { ok: true, status: 200, json: async () => ({ ok: true }) }
}

const { deleteEntryFromBoard, clearBoard } = await import('./boardDeletion.js')

const aRun = (id, serverId) => ({
  id,
  ...(serverId === undefined ? {} : { serverId }),
  at: 1700000,
  source: 'AREDL',
  step: 1,
  status: 'failed',
  score: 40,
  roundsPlayed: 1,
  rounds: [],
})

test('a run on the account is deleted by the id the server knows it by', async () => {
  requests.length = 0
  failNextDelete = false

  const result = await deleteEntryFromBoard(aRun('1700000-AREDL', 7))

  assert.equal(result.ok, true)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url.endsWith('/api/runs/7'), true, `sent ${requests[0].url}`)
  assert.equal(requests[0].method, 'DELETE')
})

test('the board id is never what gets sent', async () => {
  requests.length = 0
  await deleteEntryFromBoard(aRun('1700000-AREDL', 7))

  // The run key is a string; the route parses an integer and refuses anything
  // else with a 400, so sending it deletes nothing while reporting success.
  assert.equal(requests[0].url.includes('1700000-AREDL'), false, `sent ${requests[0].url}`)
})

test('a run the server does not know about needs no request', async () => {
  requests.length = 0

  // Played here, never saved to an account: there is nothing on the server to
  // delete, so the row can go.
  const result = await deleteEntryFromBoard(aRun('1700000-AREDL'))

  assert.equal(result.ok, true, 'the row is safe to drop')
  assert.equal(requests.length, 0, 'and no request is made')
})

test('a failed delete reports failure instead of a silent success', async () => {
  requests.length = 0
  failNextDelete = true

  const result = await deleteEntryFromBoard(aRun('1700000-AREDL', 7))

  failNextDelete = false
  // The caller uses this to decide whether to drop the row. Reporting success
  // here is what made a delete look like it worked and then undo itself.
  assert.equal(result.ok, false)
  assert.ok(result.error, 'the failure is handed back rather than swallowed')
})

test('clearing the board deletes every run the account holds', async () => {
  requests.length = 0
  failNextDelete = false

  const { survivors, error } = await clearBoard([aRun('a', 1), aRun('b', 2), aRun('c')])

  assert.equal(survivors.length, 0)
  assert.equal(error, null)
  // Two requests, not three: the run that was never on an account has nothing to
  // delete and must not be sent for one.
  assert.equal(requests.length, 2)
  assert.equal(requests.map((r) => r.url.split('/').pop()).sort().join(','), '1,2')
})

test('clearing the board keeps runs it could not delete, so the board stays true', async () => {
  requests.length = 0
  failNextDelete = true

  const board = [aRun('a', 1), aRun('b', 2)]
  const { survivors, error } = await clearBoard(board)

  failNextDelete = false
  // Every one failed, so every one stays. Showing an empty board over runs the
  // account still holds is a lie, and it is the same lie as a delete that undoes
  // itself -- just quieter.
  assert.deepEqual(
    survivors.map((entry) => entry.id),
    ['a', 'b'],
  )
  assert.ok(error, 'and the failure is reported rather than swallowed')
})
