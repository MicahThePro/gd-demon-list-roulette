/**
 * Measures the link to the Worker, for the signal symbol beside the site title.
 *
 * Deliberately separate from the rest of the app's traffic: this is the only
 * thing the symbol reports on, so it hits one fixed route (/api/ping) that does
 * no database work. A leaderboard request's round trip would measure the query
 * too, and a sign in's would measure a password hash.
 *
 * Same URL as the rest of the API, so there is one Worker to point at and one
 * to deploy.
 */

import { protocolHeaders } from './protocol.js'

const PING_URL = 'https://demon-roulette-list-proxy.micah-nordlund.workers.dev/api/ping'

/* Above this the link works but is slow enough to notice. Chosen around a
 * typical mobile round trip rather than a hard number: the point is to warn,
 * not to grade. */
const SLOW_MS = 400

/* How often to re-measure.
 *
 * A second, because a symbol next to the title is a live gauge, not a
 * background health check: a visitor glances at it, and a reading that is up to
 * thirty seconds old would contradict what they just watched happen. It only
 * ever asks one fixed route that does no database work, so the cost is a
 * subrequest against the Worker, not a query.
 *
 * The component ignores a tick that arrives while the previous round is still
 * in flight, so this is a ceiling on the rate rather than a schedule -- a link
 * bad enough to take three seconds to answer does not turn into three stacked
 * requests, it just measures once a round. */
export const PING_INTERVAL_MS = 1_000

/** What the symbol shows, derived from one measurement. */
export const signalState = (result) => {
  if (result.status === 'ok') return 'good'
  if (result.status === 'slow') return 'slow'
  return 'none'
}

/**
 * One round trip to the Worker. Never throws: every outcome is a state the
 * symbol can draw, because a failed measurement is a result here, not an error.
 */
export const pingWorker = async ({ signal } = {}) => {
  const startedAt = performance.now()

  let response
  try {
    response = await fetch(`${PING_URL}?t=${Date.now()}`, {
      method: 'GET',
      headers: protocolHeaders(),
      cache: 'no-store',
      signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    return { status: 'none', ms: null, detail: 'Worker unreachable' }
  }

  const ms = Math.round(performance.now() - startedAt)

  /* A refusal is still a live Worker -- something answered. The version gate or
   * a ban turns the response into an error status, and the symbol should show a
   * working link rather than claim the Worker is gone. */
  if (!response.ok) {
    return { status: ms > SLOW_MS ? 'slow' : 'good', ms, detail: `Worker answered ${response.status}` }
  }

  return { status: ms > SLOW_MS ? 'slow' : 'good', ms, detail: `${ms} ms` }
}