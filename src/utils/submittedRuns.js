/**
 * Which local runs have already been sent to the global leaderboard.
 *
 * Keyed on the *run key* -- the client-side id a run is posted under, which is
 * what the server groups by -- rather than the numeric id the server assigns,
 * because the numeric id is only known after a successful post and the key is
 * known before. The results screen and a leaderboard row can both offer the
 * same run, and without this a second submit would quietly create a duplicate
 * for a moderator to reject.
 *
 * This is a convenience, not a rule. The Worker refuses a second submission of
 * the same run outright, so clearing localStorage only means the button is
 * offered again and the request is then turned down. Do not treat a false here
 * as permission to submit.
 */

const KEY = 'demon-roulette-submitted'

const read = () => {
  if (typeof localStorage === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

const write = (ids) => {
  if (typeof localStorage === 'undefined') return
  try {
    // Capped so the list cannot grow without bound on a device that submits a
    // lot of runs; the oldest go first, and the local leaderboard holds at most
    // MAX_ENTRIES runs anyway.
    localStorage.setItem(KEY, JSON.stringify(ids.slice(-100)))
  } catch {
    // Private mode or a full quota. Losing this only means the guard forgets.
  }
}

export const hasSubmitted = (runId) => read().includes(runId)

export const markSubmitted = (runId) => {
  const ids = read()
  if (!ids.includes(runId)) {
    write([...ids, runId])
  }
}
