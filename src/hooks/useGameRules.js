import { useCallback, useState } from 'react'

// Each setting gets its own cookie rather than one shared blob, so adding a
// setting later cannot invalidate the others, and a player can clear one
// setting without losing the rest.
const COOKIE_ALLOW_SKIP = 'demon-roulette-allow-skip'
const COOKIE_LEVEL_LIMIT = 'demon-roulette-level-time-limit'
const COOKIE_TOTAL_LIMIT = 'demon-roulette-total-time-limit'
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365

// A limit is entered in whole minutes. 0 means off, which is the default, so a
// player who never touches the settings plays the game exactly as before.
export const MAX_TIME_LIMIT_MINUTES = 600
export const MIN_TIME_LIMIT_MINUTES = 0

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

/* A limit of 0 means off. Minutes are stored rather than milliseconds so the
   cookie stays readable and a player can hand-edit it. Anything unparseable
   falls back to off rather than to a surprise default limit. */
export const normalizeTimeLimitMinutes = (value) => {
  const numeric = Math.trunc(Number(value))
  if (!Number.isFinite(numeric)) return 0
  return Math.min(MAX_TIME_LIMIT_MINUTES, Math.max(MIN_TIME_LIMIT_MINUTES, numeric))
}

export const timeLimitMinutesToMs = (minutes) => {
  const safe = normalizeTimeLimitMinutes(minutes)
  return safe > 0 ? safe * 60 * 1000 : 0
}

// Skipping is OFF unless the player has explicitly turned it on. A missing
// cookie therefore means "cannot skip", which is the harder default: a run
// played straight through is the one people trust on a leaderboard.
//
// This only affects someone visiting for the first time. A player who already
// has the cookie keeps whatever they chose, because their saved preference is a
// decision they made rather than a default they never saw.
const readAllowSkip = () => {
  const raw = readCookie(COOKIE_ALLOW_SKIP)
  if (raw === null) return false
  return raw !== 'false'
}

/**
 * The run rules chosen in Settings: whether skipping is allowed, and the two
 * optional time limits.
 *
 * These are player preferences rather than run state, so they live here. The
 * values in use are copied onto a run when it starts (see createRun), because a
 * save code has to carry the rules it was started under, otherwise loading one
 * on another device would apply that device's settings instead.
 */
export const useGameRules = () => {
  const [allowSkip, setAllowSkipState] = useState(readAllowSkip)
  const [levelTimeLimitMinutes, setLevelTimeLimitState] = useState(() =>
    normalizeTimeLimitMinutes(readCookie(COOKIE_LEVEL_LIMIT) ?? 0),
  )
  const [totalTimeLimitMinutes, setTotalTimeLimitState] = useState(() =>
    normalizeTimeLimitMinutes(readCookie(COOKIE_TOTAL_LIMIT) ?? 0),
  )

  const setAllowSkip = useCallback((value) => {
    const next = Boolean(value)
    setAllowSkipState(next)
    writeCookie(COOKIE_ALLOW_SKIP, String(next))
    return next
  }, [])

  const setLevelTimeLimitMinutes = useCallback((value) => {
    const next = normalizeTimeLimitMinutes(value)
    setLevelTimeLimitState(next)
    writeCookie(COOKIE_LEVEL_LIMIT, String(next))
    return next
  }, [])

  const setTotalTimeLimitMinutes = useCallback((value) => {
    const next = normalizeTimeLimitMinutes(value)
    setTotalTimeLimitState(next)
    writeCookie(COOKIE_TOTAL_LIMIT, String(next))
    return next
  }, [])

  return {
    allowSkip,
    levelTimeLimitMinutes,
    totalTimeLimitMinutes,
    setAllowSkip,
    setLevelTimeLimitMinutes,
    setTotalTimeLimitMinutes,
  }
}
