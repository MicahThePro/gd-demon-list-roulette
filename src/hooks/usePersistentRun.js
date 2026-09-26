import { useEffect, useState } from 'react'

const STORAGE_KEY = 'demon-roulette-run'

export const usePersistentRun = () => {
  const [run, setRun] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (!run) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(run))
  }, [run])

  return [run, setRun]
}
