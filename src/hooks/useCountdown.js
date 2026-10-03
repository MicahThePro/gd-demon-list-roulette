/**
 * A countdown to a moment in the near future, or null when there is nothing to wait
 * for.
 *
 * Used for the admin lockout, where the server refuses a guess for a while and says
 * how long. Two things it deliberately does not do:
 *
 * It does not ask the server again. The whole point of the escalating ladder is that
 * the client cannot make the server work to find out whether it is allowed to try, so
 * the countdown runs off the number the refusal already carried and goes quiet at zero
 * rather than polling. When it reaches zero the panel says the box is open again and
 * lets the moderator press the button -- which is also the only honest test, because
 * the device clock this measures against may not be the server's.
 *
 * And it does not survive a reload, which is fine: the next attempt is what re-reads
 * the real answer. A countdown that persisted would let a stale "you may retry" claim
 * outlive the refusal it came from.
 */
import { useEffect, useState } from 'react'

export function useCountdown(seconds) {
  const [remaining, setRemaining] = useState(seconds)

  // Restart when the server sends a new number, so a second refusal replaces the
  // first rather than counting on from a stale start.
  useEffect(() => {
    setRemaining(seconds)
  }, [seconds])

  useEffect(() => {
    if (remaining === null || remaining <= 0) {
      return undefined
    }

    const timer = setInterval(() => {
      setRemaining((current) => {
        if (current === null) return null
        const next = current - 1
        return next > 0 ? next : 0
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [remaining === null])

  return remaining
}

/** "4 minutes 30 seconds" / "45 seconds", for a lockout message. */
export function formatWait(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds))
  if (safe < 60) {
    return `${safe} second${safe === 1 ? '' : 's'}`
  }

  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  const head = `${minutes} minute${minutes === 1 ? '' : 's'}`
  if (!seconds) {
    return head
  }
  return `${head} ${seconds} second${seconds === 1 ? '' : 's'}`
}