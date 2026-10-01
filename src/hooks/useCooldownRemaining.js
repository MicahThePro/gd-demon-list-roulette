import { useEffect, useMemo, useState } from 'react'

/** One day, matching the limit the Worker enforces. */
export const COOLDOWN_MS = 24 * 60 * 60 * 1000

/* How often the countdown re-renders.
 *
 * A second is the resolution the text is shown at, so ticking faster would
 * re-render this subtree for a value nobody can read. Ticking slower would make
 * the last second stretch. */
const TICK_MS = 1000

/**
 * The time left on a once-a-day limit, counting down live.
 *
 * Takes the timestamp of the last change rather than a remaining time, because a
 * remaining time is only correct at the instant it was computed: any state that
 * stored "4 hours left" would still say 4 hours tomorrow morning. The deadline
 * is derived once and the tick only re-reads the clock, so what is on screen
 * tracks real elapsed time and reaches zero on its own.
 *
 * The point of this is that a player who leaves the tab open across the deadline
 * can change their name immediately, without reloading. That is why it ticks
 * rather than reading the timestamp once: the field has to unlock by itself at
 * the moment the limit expires, because that is the moment it becomes legal.
 *
 * `changedAt` is null for an account that has never changed its name. That is not
 * the epoch and not a locked field -- it means the limit is unused, so there is
 * no deadline and the field is open from the start.
 *
 * Server-set clocks are worth being honest about. The deadline is
 * `changedAt + COOLDOWN_MS` in the server's clock and the local clock is what it
 * is compared against, so a device whose clock is badly wrong can open the field
 * early or late. It cannot be fully avoided -- any countdown computed in the
 * browser is -- but the consequence is bounded: the server still refuses a
 * premature write, so a wrong clock produces a short countdown and one failed
 * attempt, never an edit that got through too early. The client check is a
 * courtesy; the server comparison is the rule.
 */
export const useCooldownRemaining = (changedAt) => {
  const deadline = useMemo(() => {
    const last = Number(changedAt)
    // NaN here is null or a missing value, meaning never changed. There is no
    // deadline to count down to, which is reported as 0 and read as "open".
    if (!Number.isFinite(last)) {
      return null
    }
    return last + COOLDOWN_MS
  }, [changedAt])

  // Set from the clock once per tick, so the countdown is a plain read during
  // render. Reading Date.now() during render would make every re-render produce
  // a different value with no state change to justify it.
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (deadline === null) {
      return undefined
    }
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [deadline])

  if (deadline === null) {
    return { remainingMs: 0, isLocked: false }
  }

  const remainingMs = Math.max(0, deadline - now)
  return { remainingMs, isLocked: remainingMs > 0 }
}

/**
 * Formats the remaining time as the countdown the player reads.
 *
 * Rounded UP on the seconds, because a countdown that shows 0:00 while the field
 * is still disabled reads as a bug: it says the wait is over and the button says
 * otherwise. Ceiling makes the two agree on the boundary, where the display only
 * reaches 0:00 at the instant the field actually unlocks.
 *
 * Minutes are shown only below an hour. A countdown of "23 hours 59 minutes" is
 * precise but harder to read at a glance than "23h 59m", and the seconds are the
 * part that actually moves under the reader's eye at the end.
 */
export const formatCooldown = (remainingMs) => {
  const totalSeconds = Math.ceil(Math.max(0, remainingMs) / 1000)
  if (totalSeconds <= 0) {
    return '0:00'
  }

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value) => String(value).padStart(2, '0')

  if (hours > 0) {
    return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${pad(seconds)}s`
  }
  return `${seconds}s`
}