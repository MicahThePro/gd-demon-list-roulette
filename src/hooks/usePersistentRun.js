import { useEffect, useState } from 'react'
import { getElapsedLevelTimeMs } from '../utils/roulette'

const STORAGE_KEY = 'demon-roulette-run'

// The in-run timer is derived from run.currentLevelStartedAt. Persisting that raw
// value means a run restored after the tab was closed or reloaded counts the
// entire away period as play time, so the accumulated time is stored next to the
// run and the start time is rebased on restore to "now minus that much".
const toStorable = (run) => ({
  run,
  elapsedMs: getElapsedLevelTimeMs({
    startedAt: run.currentLevelStartedAt,
    currentLevelStartedAt: run.currentLevelStartedAt,
  }),
})

const fromStorable = (stored) => {
  // Runs persisted before this was tracked were a bare run object. Those restart
  // their level clock at zero rather than counting time spent away.
  const run = stored.run && typeof stored.run === 'object' ? stored.run : stored
  const elapsedMs = stored.run ? stored.elapsedMs : 0

  if (run?.status !== 'active') {
    return run
  }

  return {
    ...run,
    currentLevelStartedAt: Number.isFinite(elapsedMs)
      ? Date.now() - Math.max(0, elapsedMs)
      : Date.now(),
  }
}

export const usePersistentRun = () => {
  const [run, setRun] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? fromStorable(JSON.parse(stored)) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (!run) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStorable(run)))
  }, [run])

  return [run, setRun]
}
