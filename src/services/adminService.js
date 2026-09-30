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

const API_URL = 'https://demon-roulette-list-proxy.micah-nordlund.workers.dev'
// Marks this browser as previewing another account, so the banner survives a
// reload. The session token cannot carry this: it looks identical either way.
const PREVIEW_KEY = 'demon-roulette-preview'

const parse = async (response) => {
  let payload
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok) {
    throw new ApiError(payload?.error ?? `The server returned ${response.status}`, response.status)
  }
  return payload
}

const request = async (path, { method = 'GET', body, auth = false, passcode = null, signal } = {}) => {
  const headers = {}
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
 * Redeems a one-time login code and signs in as the account it belongs to.
 *
 * Deliberately replaces whatever session was already in this browser: this is
 * what a moderator uses to look at the site as a player, and quietly keeping the
 * old account signed in alongside it would be a trap. The caller is told who it
 * signed in as so it can say so on screen.
 *
 * Returns the user, and the session is stored like any other sign in -- so
 * signing out is ordinary signing out, and the code is spent either way.
 */
export const redeemLoginCode = async (code) => {
  const result = await request('/api/redeem', { method: 'POST', body: { code } })
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

/** Signs out of a preview session. Same as any other sign out. */
export const endPreviewSession = async () => {
  try {
    await request('/api/logout', { method: 'POST', auth: true })
  } catch {
    // As with logout() anywhere else: a network failure must not stop the
    // browser dropping its copy of the session.
  }
  saveToken(null)
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

export const fetchAuditLog = async (passcode, signal) => {
  const result = await request('/api/admin/audit', { passcode, signal })
  return result.entries ?? []
}
