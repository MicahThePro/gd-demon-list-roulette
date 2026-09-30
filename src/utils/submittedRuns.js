/**
 * Which local runs have already been sent to the global leaderboard.
 *
 * The moderation queue lives on the server, but the local leaderboard has to
 * know without asking, so the submitted ids are mirrored into localStorage. A
 * run can also be reached from two places at once -- the results screen and its
 * own row here -- and without this a second submit would quietly create a
 * duplicate run for a reviewer to reject.
 *
 * This is a convenience guard, not a permission: the server re-checks
 * everything, and clearing localStorage only means the button is offered again.
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
