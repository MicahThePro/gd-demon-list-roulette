import { useCallback, useEffect, useState } from 'react'
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

  const signOut = useCallback(async () => {
    await apiLogout()
    setUser(null)
    setError('')
  }, [])

  // A preview is ended from outside the auth UI -- the banner's own button -- so
  // the session has to be droppable without going through signOut, which also
  // revokes the session server side and the preview page already does that.
  const forgetUser = useCallback(() => {
    setUser(null)
    setError('')
  }, [])

  return { user, isRestoring, isBusy, error, setError, signIn, signUp, signOut, forgetUser }
}
