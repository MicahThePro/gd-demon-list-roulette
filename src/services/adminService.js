/**
 * The client half of account administration: the player's data mirror, redeeming
 * a one-time login code, and the admin routes behind them.
 *
 * Split from apiService rather than added to it, because these are the routes
 * with consequences -- they can delete an account and they can sign somebody in
 * -- and keeping them together means the passcode is only ever sent from the one
 * file that needs it.
 */

import { ApiError, getStoredToken, saveToken } from './apiService'
import { protocolHeaders } from './protocol.js'

const API_URL = 'https://demon-roulette-list-proxy.micah-nordlund.workers.dev'
// Marks this browser as previewing another account, so the banner survives a
// reload. The session token cannot carry this: it looks identical either way.
const PREVIEW_KEY = 'demon-roulette-preview'
// The session that was in this browser before the preview started. Redeeming a code
// overwrites the stored token, and that token was the only copy of the moderator's
// own session -- so ending the preview used to leave them signed out of an account
// they had never asked to leave. Kept here instead, and put back when the preview
// ends, which is what "end the preview" is supposed to mean. */
const PREVIOUS_TOKEN_KEY = 'demon-roulette-preview-previous-token'

const parse = async (response) => {
  let payload
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok) {
    const error = new ApiError(payload?.error ?? `The server returned ${response.status}`, response.status)
    /* The lockout carries two things a plain error message cannot.
     *
     * `retry_after_seconds` is the number the server already had when it refused, so
     * the panel can count down from it rather than asking again -- and so the countdown
     * is measured from the server's clock, not a device clock that could be behind and
     * unlock the box early.
     *
     * `permanent_ban` is a separate flag because a permanent ban is not just "wait
     * longer": it is the point where this device loses the API entirely, and the panel
     * records that locally so the notice survives a reload. The real authority is the
     * server; this flag only lets the browser say so without a round trip. */
    error.retryAfterSeconds = payload?.retry_after_seconds ?? null
    error.permanentBan = payload?.permanent_ban === true
    if (error.permanentBan) {
      rememberLocalBan()
    }
    throw error
  }
  return payload
}

/**
 * A note on this device, written when the server reports a permanent ban.
 *
 * It hides the site from the banned device and nothing else. It is worth being blunt
 * about what that is worth: the site is served as static files from GitHub Pages, on a
 * different origin from the Worker, and no Worker can decide whether a browser
 * downloads a file from a CDN. So this stops the site at this device and can be cleared
 * by clearing storage or opening a private window.
 *
 * What it cannot touch is the part that matters. The ban lives in the Worker's own
 * database, so the device stays locked out of every API call -- signing in, submitting
 * runs, the leaderboard, redeeming a code -- from any browser, forever, until somebody
 * with the database lifts it. That part is not a speed bump. This flag is the courtesy
 * half: it stops a banned device from sitting on a page that can no longer do anything.
 */
const BAN_KEY = 'demon-roulette-device-banned'

export const isLocallyBanned = () => {
  try {
    return localStorage.getItem(BAN_KEY) !== null
  } catch {
    // No storage, so no record of a ban on this device. The server still refuses every
    // call, which is the part that actually holds.
    return false
  }
}

const rememberLocalBan = () => {
  try {
    localStorage.setItem(BAN_KEY, new Date().toISOString())
  } catch {
    // Nothing to do. The server-side ban is unaffected by whether this succeeded.
  }
}

const request = async (path, { method = 'GET', body, auth = false, passcode = null, signal } = {}) => {
  // The protocol header is what the Worker gates on. See ./protocol.js.
  const headers = protocolHeaders()
  if (body !== undefined) {
    headers['content-type'] = 'application/json'
  }
  if (auth) {
    const token = getStoredToken()
    if (token) {
      headers.authorization = `Bearer ${token}`
    }
  }
  if (passcode) {
    headers['x-admin-passcode'] = passcode
  }

  let response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error
    }
    throw new ApiError('Could not reach the server. Check your connection, or try again in a moment.', 0)
  }
  return parse(response)
}

/* --- the player's own data ------------------------------------------------ */

/**
 * Mirrors the browser's run history and settings to the signed-in account.
 *
 * The browser is still the source of truth: this is a copy so a moderator can
 * see what an account holds. A player who is not signed in has nothing uploaded,
 * and one who has not played since signing up has an empty mirror, which is why
 * the panel shows when a copy was last written rather than implying it is live.
 */
export const syncPlayerData = async ({ history, settings }) => {
  if (!getStoredToken()) {
    return null
  }
  const result = await request('/api/player-data', {
    method: 'PUT',
    auth: true,
    body: {
      history: typeof history === 'string' ? history : JSON.stringify(history ?? null),
      settings: typeof settings === 'string' ? settings : JSON.stringify(settings ?? null),
    },
  })
  return result.syncedAt
}

/**
 * Uses a one-time login code to sign in as the account it belongs to.
 *
 * Deliberately replaces whatever session was already in this browser: this is
 * what a moderator uses to look at the site as a player, and quietly keeping the
 * old account signed in alongside it would be a trap. The caller is told who it
 * signed in as so it can say so on screen.
 *
 * `username` is sent as well as the code. The Worker checks the two against each
 * other, so a code pasted into the wrong account's row is refused rather than
 * signing in as whoever the code really belongs to. Sending it costs nothing and
 * turns a silent mistake into a clear error.
 *
 * Returns the user, and the session is stored like any other sign in -- so
 * signing out is ordinary signing out, and the code is spent either way.
 */
export const redeemLoginCode = async ({ username, code }) => {
  const result = await request('/api/redeem', {
    method: 'POST',
    body: { username: username ?? null, code },
  })
  // Stashed before the token is replaced, and only the first time, so a preview
  // started from inside another preview cannot overwrite the real account's
  // session with the first previewed one.
  try {
    const existing = getStoredToken()
    if (existing && !localStorage.getItem(PREVIOUS_TOKEN_KEY)) {
      localStorage.setItem(PREVIOUS_TOKEN_KEY, existing)
    }
  } catch {
    // Without storage the preview still works for this visit; ending it just leaves
    // the moderator signed out, as it did before.
  }
  saveToken(result.token)
  // Remembered in this browser only, so a reload does not quietly drop the
  // banner and make a preview look like an ordinary session.
  try {
    localStorage.setItem(PREVIEW_KEY, result.user.username)
  } catch {
    // Without storage the banner is gone, but the session itself is held in
    // memory by the app, so the preview still works for this visit.
  }
  return result.user
}

/** Ends a preview session. Only the previewed account's session ends.
 *
 *  The preview session is revoked, because it is a credential handed to a
 *  moderator and the code it came from is spent; the moderator's own session is put
 *  back rather than dropped, because ending a preview is not signing out and they
 *  never asked to be. */
export const endPreviewSession = async () => {
  /* Guarded, so ending a preview is idempotent.
   *
   * Restoring the moderator's session means removing the stash. A second call
   * finds nothing stashed, reads that as "there was no session before the
   * preview", and clears the token -- which is the moderator signing themselves
   * out of their own account by pressing the button twice, or by the banner and
   * the app both calling this. There is nothing to undo, so there is nothing to
   * do. */
  let stashed
  try {
    stashed = localStorage.getItem(PREVIOUS_TOKEN_KEY)
  } catch {
    stashed = null
  }
  if (!stashed && !getPreviewUser()) {
    return
  }
  try {
    await request('/api/logout', { method: 'POST', auth: true })
  } catch {
    // As with logout() anywhere else: a network failure must not stop the
    // browser restoring its own copy of the session.
  }

  let restored = null
  try {
    restored = localStorage.getItem(PREVIOUS_TOKEN_KEY)
    localStorage.removeItem(PREVIOUS_TOKEN_KEY)
  } catch {
    // Without storage there is no stashed token to put back, which leaves the
    // browser signed out -- the same as an ordinary sign out.
  }
  // Nothing was stashed -- there was no session before the preview -- so this is an
  // ordinary sign out and leaves the browser signed out.
  saveToken(restored)
  clearPreviewMode()
}

/**
 * The username this browser is previewing, or null.
 *
 * Held separately from the session token on purpose. The token alone cannot tell
 * an ordinary sign in from a redeemed code, and the whole point is that a
 * moderator never mistakes one for the other: this is what puts the banner on
 * screen and what the sign out button clears.
 */
export const getPreviewUser = () => {
  try {
    return localStorage.getItem(PREVIEW_KEY)
  } catch {
    return null
  }
}

export const clearPreviewMode = () => {
  try {
    localStorage.removeItem(PREVIEW_KEY)
  } catch {
    // Nothing to clear.
  }
}

/* --- the admin routes ----------------------------------------------------- */

export const searchAccounts = async (passcode, query, signal) => {
  const params = new URLSearchParams()
  if (query.trim()) {
    params.set('q', query.trim())
  }
  const suffix = params.toString() ? `?${params.toString()}` : ''
  const result = await request(`/api/admin/accounts${suffix}`, { passcode, signal })
  return result.accounts ?? []
}

export const fetchAccount = async (passcode, id, signal) => {
  const result = await request(`/api/admin/accounts/${id}`, { passcode, signal })
  return result.account
}

/**
 * Issues a fresh one-time login code for an account.
 *
 * The returned code is the only time it is ever readable, so it is written down
 * by the moderator immediately. Issuing replaces any earlier code, which is why
 * a second call always hands back something new.
 */
export const issueLoginCode = async (passcode, id) => {
  const result = await request(`/api/admin/accounts/${id}/login-code`, { method: 'POST', passcode })
  return result
}

/** Throws away a code that has been read out but not used. */
export const revokeLoginCode = async (passcode, id) =>
  request(`/api/admin/accounts/${id}/revoke-code`, { method: 'POST', passcode })

/**
 * Deletes an account and everything hanging off it.
 *
 * `confirm` is the username, which the Worker checks against its own record
 * rather than trusting the panel. That is not a security control -- a moderator
 * with the passcode can read the username off the same screen -- it is a guard
 * against deleting the wrong row.
 */
export const deleteAccount = async (passcode, id, confirm) =>
  request(`/api/admin/accounts/${id}/delete`, { method: 'POST', passcode, body: { confirm } })

/**
 * Hides one of an account's runs, submitted or not.
 *
 * Trashing is not deleting. The run keeps its row, its rounds and its statistics
 * on the account, and stops appearing on the public leaderboard, in the player's
 * own run list and in the moderation queue. That is what lets a wrong call be
 * taken back with `untrashRun` rather than being gone for good, and it is why the
 * leaderboard rank comes back exactly as it was.
 *
 * `reason` is a note for the audit log; it is not required and the Worker does
 * not act on it.
 */
export const trashRun = async (passcode, accountId, runId, reason) =>
  request(`/api/admin/accounts/${accountId}/runs/${runId}/trash`, {
    method: 'POST',
    passcode,
    body: { reason: reason ?? null },
  })

/** Puts a trashed run back, everywhere, as it was. */
export const untrashRun = async (passcode, accountId, runId) =>
  request(`/api/admin/accounts/${accountId}/runs/${runId}/untrash`, { method: 'POST', passcode })

export const fetchAuditLog = async (passcode, signal) => {
  const result = await request('/api/admin/audit', { passcode, signal })
  return result.entries ?? []
}

export const fetchSiteStats = async (passcode, signal) => {
  const result = await request('/api/admin/stats', { passcode, signal })
  return result.stats ?? result ?? {}
}
