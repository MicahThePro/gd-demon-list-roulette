import { useCallback, useState } from 'react'

import {
  DEFAULT_POINTERCRATE_PARTS,
  normalizePointercrateParts,
} from '../services/pointercrateParts.js'

/**
 * Which parts of the Pointercrate Demon List to draw from, kept in a cookie.
 *
 * A cookie rather than component state, like every other setting here, so the
 * choice survives a reload and is not tied to the screen it was made on.
 *
 * The stored value is the ticked part ids joined by commas, which keeps it
 * readable and hand-editable in the way the time limits are -- but it is run
 * back through normalizePointercrateParts on the way in, so a cookie naming a
 * part that does not exist, or naming nothing at all, cannot leave the list
 * unplayable. See that function for why an empty selection falls back to Main.
 */
const COOKIE_POINTERCRATE_PARTS = 'demon-roulette-pointercrate-parts'

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

const readStoredParts = () =>
  normalizePointercrateParts(readCookie(COOKIE_POINTERCRATE_PARTS) ?? DEFAULT_POINTERCRATE_PARTS.join(','))

/**
 * The ticked Pointercrate parts.
 *
 * `toggle` is what the tick boxes call. It refuses to tick every part off: with
 * nothing ticked there is no list to draw from and the run button could only
 * fail, so the last ticked box stays on and the click is ignored. Toggling Main
 * off while Extended is on therefore leaves Extended, which is the sensible
 * answer rather than an error.
 */
export const usePointercrateParts = () => {
  const [parts, setPartsState] = useState(readStoredParts)

  const setParts = useCallback((next) => {
    const normalized = normalizePointercrateParts(next)
    setPartsState(normalized)
    writeCookie(COOKIE_POINTERCRATE_PARTS, normalized.join(','))
    return normalized
  }, [])

  const togglePart = useCallback((id) => {
    let result
    setPartsState((current) => {
      const isOn = current.includes(id)
      const next = isOn ? current.filter((part) => part !== id) : [...current, id]

      // normalizePointercrateParts restores the default when nothing is left, so
      // unticking the final box keeps it on rather than emptying the list.
      result = normalizePointercrateParts(next)
      writeCookie(COOKIE_POINTERCRATE_PARTS, result.join(','))
      return result
    })
    return result
  }, [])

  return { parts, setParts, togglePart }
}