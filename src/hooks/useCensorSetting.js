import { useCallback, useEffect, useState } from 'react'
import {
  CENSOR_STORAGE_KEY,
  isCensoring,
  setCensoring,
  subscribeToCensoring,
} from '../utils/censor'

/**
 * Remembers whether the player wants swear words masked, and keeps the mask in
 * step with that choice across the whole app.
 *
 * localStorage rather than a cookie, unlike the run rules in useGameRules. That is
 * deliberate rather than inconsistent: those describe a run and are read by the
 * code that starts one, while this only decides what the screen shows. It also has
 * nothing to do with the run code, which must keep decoding the same way
 * everywhere, and adding a field to that code for a display preference would make
 * two runs that played identically decode differently.
 *
 * Masked unless the player turns it off. Storage is read by the mask itself before
 * anything renders (see `shouldMask` in censor.js), and this hook starts from the
 * same place rather than reading storage a second time, so a player who has chosen
 * to read the real names never sees a frame of starred words first.
 */
const writeStored = (value) => {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CENSOR_STORAGE_KEY, String(value))
  } catch {
    // A failed write only costs the setting its stickiness. The mask still changed
    // for this visit, so there is nothing worth telling the player about.
  }
}

/**
 * The player's masking preference, as [isMasked, setIsMasked].
 *
 * Also drives the mask and redraws when it changes, because masking happens in a
 * plain function inside components that are handed no settings at all -- see the
 * note on `censorText`. Flipping it has to re-render, or the words stay starred on
 * screen until a reload.
 */
export const useCensorSetting = () => {
  const [isMasked, setIsMaskedState] = useState(isCensoring)

  /* The mask can also be changed from outside this hook, which only the tests do
   * today. Subscribing keeps the two copies from drifting apart rather than
   * leaving the checkbox showing a value the mask is not actually using. */
  useEffect(() => {
    return subscribeToCensoring((next) => {
      setIsMaskedState((current) => (current === next ? current : next))
    })
  }, [])

  const setIsMasked = useCallback((value) => {
    const next = Boolean(value)
    setCensoring(next)
    writeStored(next)
    return next
  }, [])

  // Storage can differ between tabs, so two open tabs should not disagree about
  // whether words are masked.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleStorage = (event) => {
      if (event.key !== CENSOR_STORAGE_KEY) return
      // Routed through setCensoring rather than setState alone, so the mask
      // follows the other tab and this one redraws to match it.
      setCensoring(event.newValue !== 'false')
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  return [isMasked, setIsMasked]
}