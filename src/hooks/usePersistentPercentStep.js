import { useCallback, useState } from 'react'
import { normalizePercentStep } from '../utils/roulette'

const COOKIE_NAME = 'demon-roulette-percent-step'
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365

const readCookie = (name) => {
  if (typeof document === 'undefined') return null

  const prefix = `${encodeURIComponent(name)}=`
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))

  return match ? decodeURIComponent(match.slice(prefix.length)) : null
}

const writeCookie = (name, value) => {
  if (typeof document === 'undefined') return

  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=${ONE_YEAR_IN_SECONDS}; samesite=lax`
}

export const usePersistentPercentStep = () => {
  const [percentStep, setPercentStepState] = useState(() =>
    normalizePercentStep(readCookie(COOKIE_NAME) ?? 1),
  )

  const setPercentStep = useCallback((value) => {
    const safeStep = normalizePercentStep(value)
    setPercentStepState(safeStep)
    writeCookie(COOKIE_NAME, String(safeStep))
    return safeStep
  }, [])

  return [percentStep, setPercentStep]
}
