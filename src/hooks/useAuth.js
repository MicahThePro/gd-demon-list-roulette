import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchMe, getStoredToken, login, logout as apiLogout, register as apiRegister } from '../services/apiService'

/**
 * Holds the signed-in player.
 *
 * On mount, a token left in localStorage by a previous visit is checked against
 * the server. That request is deliberately not allowed to block the page: the
 * game itself is entirely offline, so a slow or unreachable Worker must not
 * hold up the home screen. The account simply appears once it answers.
 */
export const useAuth = () => {
  const [user, setUser] = useState(null)
  // Whether a preview is in progress, and the account that was signed in before it
  // started so ending the preview can put it back. In a ref rather than state: it
  // is only ever read while handling the button, and nothing renders from it
  // directly -- the flag is what renders, and that has to be state to re-render.
  const savedUser = useRef(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  // Starting true whenever a token exists means the "checking your sign in"
  // line is already correct on the first render, instead of flashing a signed
  // out form that is about to be replaced.
  const [isRestoring, setIsRestoring] = useState(() => Boolean(getStoredToken()))
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  useEffect(() => {
    if (!getStoredToken()) {
      return undefined
    }

    const controller = new AbortController()
    let isActive = true

    // The two setters are called from a promise callback, never from the effect
    // body, so this is a subscription to an external system rather than a
    // render-time update.
    fetchMe(controller.signal)
      .then((restored) => {
        if (isActive) {
          setUser(restored)
        }
      })
      .catch(() => {
        // Left signed out on failure. The token is kept, so a temporary network
        // problem does not force a fresh sign in, and the next page load tries
        // it again.
      })
      .finally(() => {
        if (isActive) {
          setIsRestoring(false)
        }
      })

    return () => {
      isActive = false
      controller.abort()
    }
  }, [])

  const signIn = useCallback(async (credentials) => {
    setIsBusy(true)
    setError('')
    try {
      const next = await login(credentials)
      setUser(next)
      return { ok: true }
    } catch (caught) {
      setError(caught?.message ?? 'Could not sign in.')
      return { ok: false }
    } finally {
      setIsBusy(false)
    }
  }, [])

  const signUp = useCallback(async (details) => {
    setIsBusy(true)
    setError('')
    try {
      const next = await apiRegister(details)
      setUser(next)
      return { ok: true }
    } catch (caught) {
      setError(caught?.message ?? 'Could not create that account.')
      return { ok: false }
    } finally {
      setIsBusy(false)
    }
  }, [])

  /* Signing out.
   *
   * Goes back to this device's own runs rather than leaving the account's on screen.
   *
   * That is the other half of the board belonging to one account: signing in shows
   * the account's runs and nothing else, so signing out has to put back what was
   * there before. Leaving them up means the next person to use this browser is
   * looking at somebody's runs with no indication of whose they are -- which is the
   * same leak in the other direction, and the reason the shared-device case matters
   * in both orders.
   *
   * The restore is in the app, not the hook, because the hook cannot know an
   * account has ended; only the thing that owns the session knows that. */
  const signOut = useCallback(async () => {
    await apiLogout()
    setUser(null)
    setError('')
  }, [])

  /* Previewing somebody else's account.
   *
   * Redeeming a login code puts the code's token in storage and hands the app the
   * user it belongs to, but nothing here was told about it -- so `user` stayed the
   * moderator's own account while every request carried the previewed account's
   * token. That is the worst of both: the header said one name, saving a run wrote
   * it to the other, and the mismatch only showed up as a request failing.
   *
   * So the swap goes through here, and the account it replaced is kept rather than
   * dropped. Ending a preview is not signing out -- the moderator never asked to be
   * signed out of their own account, and the preview session is the only thing that
   * should end -- so the saved user comes back and the app is exactly as it was,
   * with the previewed account's session revoked. */

  // Passed in rather than read from state, so this stays a plain assignment and the
  // account being replaced is decided by the caller that can see it, not by an
  // updater function with a side effect in it.
  const startPreview = useCallback((previewed, previousUser) => {
    if (savedUser.current === null) {
      savedUser.current = previousUser ?? null
    }
    setUser(previewed)
    setIsPreviewing(true)
  }, [])

  const endPreview = useCallback(() => {
    const own = savedUser.current
    savedUser.current = null
    setUser(own)
    setIsPreviewing(false)
  }, [])

  /* Re-reads whoever the stored token belongs to.
   *
   * Used after a preview ends. The token that was in storage before the code was
   * redeemed is put back, but the app had no copy of the account it belonged to --
   * a preview can survive a reload, and then the account being restored was never
   * in memory to begin with. Reading it back is the same check the app does on
   * mount, and it is also what makes ending a preview with no session before it
   * correctly leave the browser signed out rather than showing a dead account. */
  const refresh = useCallback(async () => {
    try {
      setUser(await fetchMe())
    } catch {
      setUser(null)
    }
  }, [])

  return {
    user,
    isPreviewing,
    isRestoring,
    isBusy,
    error,
    setError,
    signIn,
    signUp,
    signOut,
    startPreview,
    endPreview,
    refresh,
  }
}
