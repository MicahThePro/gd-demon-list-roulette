/**
 * The client half of the Worker's accounts and global leaderboard API.
 *
 * The same Worker that re-serves the Impossible Levels and Challenge Lists
 * also owns the D1 database, so there is one origin to talk to and one thing
 * to deploy. It is the same URL the list service already uses.
 *
 * The session token is held in localStorage rather than only in a cookie: the
 * site is served from GitHub Pages, so the Worker is a third-party origin and
 * modern browsers will not attach its cookie to the site's own requests. The
 * token therefore travels in an Authorization header on every call. The Worker
 * also sets a SameSite=Lax cookie, which is only a fallback for the reload case.
 */

const API_URL = 'https://demon-roulette-list-proxy.micah-nordlund.workers.dev'
const TOKEN_KEY = 'demon-roulette-session'

// The lists a run can be submitted for. The value is the display name the run
// screen shows, which is what the Worker validates against, so a renamed list
// is a one-line change in one place.
export const SUBMITTABLE_SOURCES = [
  'Pointercrate Demon List',
  'All Rated Extreme Demons List',
  'Global Shitty List',
  'Challenge List',
  'Impossible Levels List',
]

/** The boards the global leaderboard can be sorted by. */
export const LEADERBOARD_BOARDS = [
  { id: 'farthest', label: 'Farthest %' },
  { id: 'levels', label: 'Most levels cleared' },
  { id: 'fastest', label: 'Fastest run' },
  { id: 'clean', label: 'Fewest skips' },
  { id: 'recent', label: 'Most recent' },
]

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export const saveToken = (token) => {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
  } catch {
    // Private browsing with storage disabled still works for the session in
    // memory; it just will not survive a reload.
  }
}

export const getStoredToken = readToken

const request = async (path, { method = 'GET', body, auth = false, signal } = {}) => {
  const headers = {}
  if (body !== undefined) {
    headers['content-type'] = 'application/json'
  }

  const token = auth ? readToken() : null
  if (token) {
    headers.authorization = `Bearer ${token}`
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
    // A network failure, an offline tab or a Worker that is not deployed yet.
    // The message says which, because the fix is different for each.
    throw new ApiError(
      'Could not reach the server. Check your connection, or try again in a moment.',
      0,
    )
  }

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

export const register = async ({ username, password, displayName }) => {
  const result = await request('/api/register', {
    method: 'POST',
    body: { username, password, displayName },
  })
  saveToken(result.token)
  return result.user
}

export const login = async ({ username, password }) => {
  const result = await request('/api/login', { method: 'POST', body: { username, password } })
  saveToken(result.token)
  return result.user
}

export const logout = async () => {
  try {
    await request('/api/logout', { method: 'POST', auth: true })
  } catch {
    // Signing out locally has to happen even if the call failed, otherwise a
    // player on a plane could not sign out of the site.
  }
  saveToken(null)
}

export const fetchMe = async (signal) => {
  if (!readToken()) {
    return null
  }
  try {
    const result = await request('/api/me', { auth: true, signal })
    return result.user ?? null
  } catch (error) {
    // A token the server no longer knows about is cleared, so the UI drops back
    // to signed out instead of showing a broken account.
    if (error instanceof ApiError && error.status === 401) {
      saveToken(null)
      return null
    }
    throw error
  }
}

/**
 * Turns an ended run into the payload the Worker accepts.
 *
 * The give-up level is not in run.rounds, so it is appended here the same way
 * the results screen appends it, and a timed-out run keeps the timeout round
 * that the run screen already recorded.
 *
 * Submitting a run and uploading its recording live in submissionService, so
 * everything to do with a run reaching the server is in one file. The run
 * payload itself is re-exported from here because the Worker tests mirror this
 * exact shape.
 */
export { buildRunPayload } from './submissionService'

export const fetchMyRuns = async (signal) => {
  const result = await request('/api/runs?limit=100', { auth: true, signal })
  return result.runs ?? []
}

export const deleteRun = async (id) => request(`/api/runs/${id}`, { method: 'DELETE', auth: true })

export const fetchLeaderboard = async ({ board = 'farthest', source = 'all', limit = 50, signal } = {}) => {
  const params = new URLSearchParams({ board, source, limit: String(limit) })
  const result = await request(`/api/leaderboard?${params.toString()}`, { signal })
  return {
    board: result.board ?? board,
    label: result.label ?? '',
    source: result.source ?? 'all',
    entries: result.entries ?? [],
    you: result.you ?? null,
    personal: result.personal ?? null,
  }
}
