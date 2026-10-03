import { protocolHeaders } from './protocol.js'
import { getStoredToken } from './apiService.js'

const API_URL = 'https://demon-roulette-list-proxy.micah-nordlund.workers.dev'

export class CustomRunError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'CustomRunError'
    this.status = status
  }
}

const request = async (path, { method = 'GET', body, authenticated = false } = {}) => {
  const headers = protocolHeaders()
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (authenticated) {
    const token = getStoredToken()
    if (token) headers.authorization = `Bearer ${token}`
  }

  let response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new CustomRunError('Could not reach the server. Check your connection and try again.')
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok) {
    throw new CustomRunError(payload?.error ?? `The server returned ${response.status}.`, response.status)
  }
  return payload
}

export const createCustomRun = (definition) =>
  request('/api/custom-runs', {
    method: 'POST',
    body: definition,
    authenticated: true,
  })

export const getCustomRun = (id) =>
  request(`/api/custom-runs/${encodeURIComponent(id)}`)

export const getCustomRunLevel = (id, index) =>
  request(`/api/custom-runs/${encodeURIComponent(id)}/levels/${index}`)
