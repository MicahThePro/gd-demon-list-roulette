import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * Ending a preview must leave the moderator signed in as themselves.
 *
 * The bug this covers was a preview that worked right up to the button and then
 * signed the moderator out of their own account. Redeeming a login code replaces
 * the stored session token, so the moderator's original token is stashed first and
 * put back at the end. Anything that consumes that stash twice -- two callers, or
 * one caller firing twice -- consumed it once and then read the second, empty read
 * as "there was no session before the preview", which clears the token and signs
 * them out. So ending a preview has to be safe to call more than once.
 */

/* A localStorage, and a fetch, stood in for the browser's and the Worker's.
   Both are module-level in adminService and apiService, so they are installed as
   globals before those modules are imported, which is why the import below is
   dynamic: a static one would run before the globals exist. */
const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
}

/* One recorded request per call, and a canned answer. Only the paths this test
   touches are given real behaviour; anything else is a bug and throws. */
const calls = []
globalThis.fetch = async (url, options = {}) => {
  const { body } = options
  const parsed = body === undefined ? null : JSON.parse(body)
  calls.push({ url, method: options.method ?? 'GET', body: parsed, authorization: options.headers?.authorization ?? null })
  const reply = (payload) => ({ ok: true, status: 200, json: async () => payload })
  if (url.endsWith('/api/redeem')) {
    return reply({ token: 'preview-token', user: { id: 2, username: 'lt4717' } })
  }
  if (url.endsWith('/api/logout')) {
    return reply({ ok: true })
  }
  throw new Error(`unexpected request: ${options.method ?? 'GET'} ${url}`)
}

const { redeemLoginCode, endPreviewSession, getPreviewUser } = await import('./adminService.js')
const { getStoredToken, saveToken } = await import('./apiService.js')

const ownToken = 'moderator-token'

test('a redeemed code replaces the session, and remembers the one it replaced', async () => {
  storage.clear()
  calls.length = 0
  saveToken(ownToken)

  const previewed = await redeemLoginCode({ username: 'lt4717', code: 'CODE-1' })

  assert.equal(previewed.username, 'lt4717')
  assert.equal(getStoredToken(), 'preview-token', 'the previewed account is now the session')
  assert.equal(getPreviewUser(), 'lt4717', 'the banner knows who is being previewed')
})

test('ending the preview puts the moderator back in their own account', async () => {
  await endPreviewSession()

  assert.equal(getStoredToken(), ownToken, 'the session before the preview is restored')
  assert.equal(getPreviewUser(), null, 'and the banner marker is cleared')
  // Only the previewed account's session is revoked. Revoking the restored token
  // would sign the moderator out on the server even though the browser still
  // holds it, and the next fetchMe would fail.
  const logouts = calls.filter((call) => call.url.endsWith('/api/logout'))
  assert.equal(logouts.length, 1)
  assert.equal(logouts[0].authorization, 'Bearer preview-token')
})

test('ending a preview twice leaves the moderator signed in', async () => {
  // The stash is gone now, and the token is the moderator's own. A second call
  // must not read "nothing stashed" as "there was no session before the preview"
  // and clear it.
  await endPreviewSession()
  await endPreviewSession()

  assert.equal(getStoredToken(), ownToken, 'the session survives being ended twice')
  assert.equal(
    calls.filter((call) => call.url.endsWith('/api/logout')).length,
    1,
    'and the restored session is not revoked a second time',
  )
})

test('a preview started with no session before it still signs out', async () => {
  // The opposite case: a moderator who was not signed in to anything has no token
  // to put back, so ending the preview must leave the browser signed out rather
  // than preserving a session that never existed.
  storage.clear()
  calls.length = 0
  saveToken(null)

  await redeemLoginCode({ username: 'lt4717', code: 'CODE-2' })
  assert.equal(getStoredToken(), 'preview-token')

  await endPreviewSession()

  assert.equal(getStoredToken(), null, 'no session before, no session after')
  assert.equal(getPreviewUser(), null)
})

test('a preview inside a preview restores the moderator, not the first preview', async () => {
  storage.clear()
  calls.length = 0
  saveToken(ownToken)

  await redeemLoginCode({ username: 'lt4717', code: 'CODE-3' })
  await redeemLoginCode({ username: 'someone_else', code: 'CODE-4' })

  await endPreviewSession()

  assert.equal(getStoredToken(), ownToken, 'the stash is written once, and read once')
})
