/**
 * Uploading a run's recording, and the moderation API.
 *
 * A submission is two things: the run, which was already stored, and the video
 * that goes with it. The run is posted first and its id comes back, then the
 * video is uploaded against that id. The run sits off the public leaderboard
 * the moment it is stored and only appears once the recording is approved, so
 * there is no window where an unvouched-for score is on the board.
 */

const API_URL = 'https://demon-roulette-list-proxy.micah-nordlund.workers.dev'
const TOKEN_KEY = 'demon-roulette-session'

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

/** Builds the headers for a call. `passcode` is only ever sent to the admin
 * routes, and only from the admin page, which is the only place that has it. */
const headersFor = ({ auth = false, passcode = null, json = false } = {}) => {
  const headers = {}
  if (json) {
    headers['content-type'] = 'application/json'
  }
  if (auth) {
    const token = readToken()
    if (token) {
      headers.authorization = `Bearer ${token}`
    }
  }
  if (passcode) {
    headers['x-admin-passcode'] = passcode
  }
  return headers
}

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

const jsonRequest = async (path, { method = 'GET', body, auth = false, passcode = null, signal } = {}) => {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: headersFor({ auth, passcode, json: body !== undefined }),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  return parse(response)
}

/* A submission is JSON, not an upload: the run is already stored, and the
   proof is a link the player has to a video on their own host. Nothing large
   crosses the network, so there is nothing to stream and no size to worry
   about. */
const submitProof = async ({ runId, videoUrl, container, note }) =>
  jsonRequest('/api/submissions', {
    method: 'POST',
    body: { runId, videoUrl, container, note: note ?? null },
    auth: true,
  })

export const submitRun = async (run, endedAt) => {
  const payload = buildRunPayload(run, endedAt)
  const result = await jsonRequest('/api/runs', { method: 'POST', body: payload, auth: true })
  return result.run
}

export const uploadRecording = async ({ runId, videoUrl, container, note }) => {
  const result = await submitProof({ runId, videoUrl, container, note })
  return result.submission
}

export const fetchMySubmissions = async (signal) => {
  const result = await jsonRequest('/api/submissions/mine', { auth: true, signal })
  return result.submissions ?? []
}

/* --- moderation --------------------------------------------------------- */

export const fetchAdminSubmissions = async (passcode, status, signal) => {
  const query = status && status !== 'all' ? `?status=${status}` : ''
  const result = await jsonRequest(`/api/admin/submissions${query}`, { passcode, signal })
  return result.submissions ?? []
}

export const adminDecide = async (passcode, id, action, note) =>
  jsonRequest(`/api/admin/submissions/${id}/${action}`, {
    method: 'POST',
    body: { note: note ?? null },
    passcode,
  })

/* The video is a link on the player's own host, so there is nothing to stream
   and nothing to fetch. The Worker never makes a third party request either,
   which is why no route for it exists. */

/* --- the run payload, shared with the worker tests ----------------------- */

export const buildRunPayload = (run, endedAt = Date.now()) => {
  const rounds = [...(run?.rounds ?? [])]

  if (run?.gaveUp === true && run.currentLevel) {
    const startedAt = run.currentLevelStartedAt
    rounds.push({
      levelId: run.currentLevel.id,
      levelName: run.currentLevel.name,
      targetPercent: run.endingPercent ?? run.currentTarget,
      achievedPercent: null,
      result: 'gaveup',
      elapsedMs:
        Number.isFinite(startedAt) && Number.isFinite(run.gaveUpAt)
          ? Math.max(0, run.gaveUpAt - startedAt)
          : null,
      video: run.currentLevel.video ?? null,
      skipReason: null,
    })
  }

  return {
    runId: run?.runId ?? `${endedAt}-${run?.source ?? 'run'}`,
    source: run?.source ?? 'Unknown list',
    percentStep: Number.isFinite(run?.percentStep) ? run.percentStep : 1,
    status: run?.status === 'completed' ? 'completed' : run?.gaveUp === true ? 'gaveup' : 'failed',
    endedAt,
    rounds: rounds.map((round) => ({
      levelId: round.level?.id ?? null,
      levelName: round.level?.name ?? 'Unknown level',
      targetPercent: round.targetPercent ?? null,
      achievedPercent: round.achievedPercent ?? null,
      result: round.result,
      elapsedMs: Number.isFinite(round.elapsedMs) ? round.elapsedMs : null,
      video: round.level?.video ?? null,
      skipReason: round.result === 'skipped' ? (round.skipReason ?? null) : null,
    })),
  }
}
