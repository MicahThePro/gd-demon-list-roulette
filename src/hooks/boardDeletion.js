/**
 * What deleting a run from the board means.
 *
 * Split out of the hook because this is a decision about ids and about the server,
 * not a piece of state, and it is the part worth testing: a bug in it does not look
 * like a bug, it looks like a delete button that sometimes does nothing.
 */
import { deleteRun } from '../services/apiService'

/**
 * Deletes one run, returning whether it is safe to drop from the board.
 *
 * The board a signed-in player sees is the account's, not the device's, and the app
 * re-reads that account on an interval and on every sign in. So removing the row
 * locally is not a delete -- it is a temporary edit, undone by the next read, and
 * the run comes back. That is why this asks the server first and reports whether to
 * drop the row only once the server has agreed.
 *
 * The id is the whole trap. A board entry's own `id` is the run key the client
 * minted, a string like "1700000-AREDL". `serverId` is the number the server
 * knows the run by, and that is the one DELETE /api/runs/:id takes. Sending the key
 * deletes nothing at all and still reports success, which is the worst version of
 * this bug: the row vanishes, the run returns, and nothing says why.
 *
 * A run the server does not know about -- played here, never saved to an account --
 * has no `serverId`, and there is nothing to delete anywhere but this browser.
 *
 * Returns `{ ok: true }` when the row should be dropped, and `{ ok: false, error }`
 * when it should stay, so a failed delete leaves the run visible where it really is
 * rather than pretending.
 */
export const deleteEntryFromBoard = async (entry) => {
  if (entry?.serverId == null) {
    return { ok: true }
  }
  try {
    await deleteRun(entry.serverId)
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}

/**
 * Clears the board, deleting every run the account knows about first.
 *
 * One at a time and in sequence, because there is no bulk route and a burst of
 * deletes at once is a burst of requests the Worker has no reason to absorb all at
 * one moment. Each is settled before the next is sent, so a failure on one run
 * cannot abandon the rest half done.
 *
 * What survives is reported rather than hidden: the rows that could not be deleted
 * stay on the board, so afterwards the board holds exactly the runs the server still
 * has, which is the truth, rather than a tidy empty list over runs that are still
 * there.
 */
export const clearBoard = async (entries) => {
  const survivors = []
  let lastError = null
  for (const entry of entries) {
    // Sequential on purpose, as above.
    const result = await deleteEntryFromBoard(entry)
    if (!result.ok) {
      survivors.push(entry)
      lastError = result.error
    }
  }
  return { survivors, error: survivors.length ? (lastError ?? new Error('Some runs could not be deleted')) : null }
}
