import { useCallback, useState } from 'react'

const COOKIE_NAME = 'demon-roulette-list-source'
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365
const DEFAULT_SOURCE = 'pointercrate'

// The values the <select> in HomePage can produce. A cookie is user-editable
// and survives deploys, so anything not in this set is ignored rather than
// passed on to fetchList, which would throw on an unknown source.
export const LIST_SOURCES = [
  'pointercrate',
  'aredl',
  'gsl',
  'challengelist',
  'impossiblelevels',
]

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

const normalize = (value) => (LIST_SOURCES.includes(value) ? value : DEFAULT_SOURCE)

/**
 * Remembers the list picked in the main menu, so reloading or returning from a
 * run lands on the same list. Mirrors usePersistentPercentStep.
 */
export const usePersistentListSource = () => {
  const [source, setSourceState] = useState(() => normalize(readCookie(COOKIE_NAME) ?? DEFAULT_SOURCE))

  const setSource = useCallback((value) => {
    const safeSource = normalize(value)
    setSourceState(safeSource)
    writeCookie(COOKIE_NAME, safeSource)
    return safeSource
  }, [])

  return [source, setSource]
}
