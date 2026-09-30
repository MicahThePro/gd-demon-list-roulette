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

/* --- runs saved to the account, not just to this device -------------------- */

/* A separate list from the submitted one, and deliberately so. "Sent for review"
   and "kept on the account" are different facts about a run: a run can be saved
   without ever being submitted, and a run that was submitted is on the account
   too. Keeping them in one list would make the results screen claim a run was
   saved simply because it had been submitted -- true, but for the wrong reason,
   and it would hide the fact that a run had never been kept.

   The same shape and the same cap as the submitted list, for the same reasons:
   keyed on the run key so the guard works before the server id is known, and
   capped so it cannot grow without bound. This one is a pure convenience -- the
   server is the authority on what is on the account, and the app re-reads that
   on every sign in. */
const SAVED_KEY = 'demon-roulette-saved-to-account'

const readSaved = () => {
  if (typeof localStorage === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_KEY))
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

const writeSaved = (ids) => {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(ids.slice(-100)))
  } catch {
    // As above: losing this only means the button is offered again, and saving
    // the same run twice updates one row rather than making two.
  }
}

export const hasSavedToAccount = (runId) => readSaved().includes(runId)

export const markSavedToAccount = (runId) => {
  const ids = readSaved()
  if (!ids.includes(runId)) {
    writeSaved([...ids, runId])
  }
}
