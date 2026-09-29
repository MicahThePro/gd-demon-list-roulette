import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import HomePage from './pages/HomePage'
import RoulettePage from './pages/RoulettePage'
import ResultsPage from './pages/ResultsPage'
import { usePersistentRun } from './hooks/usePersistentRun'
import { useRunHistory } from './hooks/useRunHistory'
import { useGameRules, timeLimitMinutesToMs } from './hooks/useGameRules'
import { fetchAredlLevelDetails, fetchImpossibleLevelDetails, fetchList } from './services/listService'
import { clampPercent, createRun, createLevelResult, countSkipReason, decodeRunState, encodeRunState, getElapsedLevelTimeMs, getRunElapsedMs, getNextTargetPercent, normalizePercentStep, pickNextLevel, summarizeResult } from './utils/roulette'
import { SITE_NAME, LATEST_VERSION } from './data/changelog'
import './App.css'

const SCREEN = {
  HOME: 'home',
  ROULETTE: 'roulette',
  RESULTS: 'results',
}

// The AREDL list endpoint returns no creator or video, only publisher_id, so
// those come from the per-level detail endpoint. That is fetched on demand for
// the one level on screen rather than for the whole list, which would be far
// too slow. run.source holds the list's display title.
const HYDRATABLE_SOURCES = new Set(['AREDL'])

// The Impossible Levels list omits the rate a level must be played at and the
// game version it needs, and neither can be derived from the list fields (the
// TPS/FPS unit depends on the level's 2.2 tag). Both are asked of the Worker
// for the one level on screen. The build-time snapshot may already carry them,
// in which case there is nothing to fetch.
const RATE_SOURCE = 'Impossible Levels List'

const attachLevelDetails = async (runState, level) => {
  if (!level || runState?.source !== RATE_SOURCE) {
    return level
  }

  if (level.rate && level.version) {
    return level
  }

  const { rate, version } = await fetchImpossibleLevelDetails(level.listId)
  return { ...level, rate: level.rate ?? rate, version: level.version ?? version }
}

const hydrateLevelForRun = async (runState, level) => {
  const withDetails = await attachLevelDetails(runState, level)
  return hydrateAredlLevel(runState, withDetails)
}

const hydrateAredlLevel = async (runState, level) => {
  if (!level || !HYDRATABLE_SOURCES.has(runState?.source)) {
    return level
  }

  const creatorValue = typeof level.creator === 'string' ? level.creator.trim() : ''
  const thumbnailValue = typeof level.thumbnail === 'string' ? level.thumbnail.trim() : ''
  const shouldHydrate =
    !thumbnailValue ||
    !creatorValue ||
    creatorValue === 'Unknown creator' ||
    creatorValue === 'Unknown Creator'

  if (!shouldHydrate) {
    return level
  }

  const hydratedLevel = await fetchAredlLevelDetails(level)

  if (!hydratedLevel) {
    return level
  }

  return {
    ...level,
    ...hydratedLevel,
    creator: hydratedLevel.creator || level.creator || 'Unknown creator',
    thumbnail: hydratedLevel.thumbnail || level.thumbnail || null,
  }
}

function App() {
  const [screen, setScreen] = useState(SCREEN.HOME)
  const [run, setRun] = usePersistentRun()
  const gameRules = useGameRules()
  const history = useRunHistory()
  // Identifies the run being played, so an ended run is recorded exactly once
  // even though several code paths reach the results screen.
  const trackedRunId = useRef(null)
  const [saveCode, setSaveCode] = useState('')

  const currentStatus = useMemo(() => summarizeResult(run), [run])

  // The browser tab title carries the version too, derived from the same
  // changelog entry as the on-page heading.
  useEffect(() => {
    document.title = `${SITE_NAME} ${LATEST_VERSION}`
  }, [])

  const saveCurrentRun = () => {
    if (!run) {
      return ''
    }

    // The timer is derived from currentLevelStartedAt, so a bare save leaves that
    // timestamp pointing at the moment of saving and every second spent away
    // would be counted as play time on the next load. The elapsed time at the
    // point of saving is stored instead, and loadRunFromCode rebases the start
    // time to "now minus that much", which pauses the clock across the gap.
    const elapsedMs = getElapsedLevelTimeMs({
      startedAt: run.currentLevelStartedAt,
      currentLevelStartedAt: run.currentLevelStartedAt,
    })

    const encoded = encodeRunState({ ...run, elapsedMs })
    setSaveCode(encoded)
    return encoded
  }

  const loadRunFromCode = (encodedCode) => {
    const decoded = decodeRunState(encodedCode)
    if (!decoded) {
      return false
    }

    const loaded = {
      ...decoded,
      // Resume where the save left off rather than counting the time away. A
      // code saved before this field existed has no elapsed time, so those runs
      // restart their level clock at zero.
      currentLevelStartedAt: Number.isFinite(decoded.elapsedMs)
        ? Date.now() - Math.max(0, decoded.elapsedMs)
        : Date.now(),
    }
    delete loaded.elapsedMs

    setRun(loaded)
    setSaveCode(encodedCode)
    setScreen(decoded.status === 'active' ? SCREEN.ROULETTE : SCREEN.RESULTS)
    return true
  }

  const startRun = async (request = {}) => {
    const importedList = await fetchList(request)
    const percentStep = normalizePercentStep(request.percentStep ?? 1)
    const createdRun = createRun({
      startingPercent: percentStep,
      levels: importedList.levels,
      source: importedList.sourceTitle,
      allowDuplicates: false,
      percentStep,
      // The player's current rules are frozen onto the run here. Reading them
      // again while it is played would mean changing a setting mid-run silently
      // changed the rules, and a save code loaded on another device would pick
      // up that device's settings instead of the ones the run started under.
      allowSkip: gameRules.allowSkip,
      levelTimeLimitMs: timeLimitMinutesToMs(gameRules.levelTimeLimitMinutes),
      totalTimeLimitMs: timeLimitMinutesToMs(gameRules.totalTimeLimitMinutes),
    })

    const hydratedCurrentLevel = await hydrateLevelForRun(createdRun, createdRun.currentLevel)
    setRun({
      ...createdRun,
      currentLevel: hydratedCurrentLevel,
    })
    setScreen(SCREEN.ROULETTE)
  }

  const finishRound = async (achievedPercent) => {
    if (!run || !run.currentLevel) return

    const normalizedAchieved = clampPercent(achievedPercent)
    const isSuccess = normalizedAchieved >= run.currentTarget
    const percentStep = normalizePercentStep(run.percentStep ?? 1)
    const endedAt = Date.now()
    const currentResult = createLevelResult({
      level: run.currentLevel,
      targetPercent: run.currentTarget,
      achievedPercent: normalizedAchieved,
      result: isSuccess ? 'success' : 'failure',
      startedAt: run.currentLevelStartedAt ?? endedAt,
      endedAt,
    })

    const updatedRounds = [
      ...run.rounds,
      {
        ...currentResult,
        roundNumber: run.rounds.length + 1,
      },
    ]

    const nextTarget = isSuccess
      ? getNextTargetPercent(normalizedAchieved, percentStep)
      : run.currentTarget
    const usedLevelIds = [...(run.usedLevelIds || []), run.currentLevel.id]
    const nextLevel = pickNextLevel(run.levels, usedLevelIds, run.allowDuplicates)

    if (!isSuccess) {
      const failedRun = {
        ...run,
        status: 'failed',
        rounds: updatedRounds,
        usedLevelIds,
        endingPercent: run.currentTarget,
      }
      endRun(failedRun, endedAt)
      return
    }

    // The run finishes when the level just cleared reached 100%, not when the
    // next target would be 100. With a step of 20 the targets are 20, 40, 60,
    // 80, 100, so clearing 80 must still hand out the 100% level.
    if (normalizedAchieved >= 100) {
      const completedRun = {
        ...run,
        currentTarget: 100,
        status: 'completed',
        rounds: updatedRounds,
        usedLevelIds,
        endingPercent: 100,
        currentLevel: null,
      }
      endRun(completedRun, endedAt)
      return
    }

    const hydratedNextLevel = await hydrateLevelForRun(run, nextLevel)
    const activeRun = {
      ...run,
      currentTarget: nextTarget,
      rounds: updatedRounds,
      usedLevelIds,
      currentLevel: hydratedNextLevel,
      currentLevelStartedAt: Date.now(),
      endingPercent: nextTarget,
      status: 'active',
    }

    setRun(activeRun)
  }

  // Every path that ends a run routes through here, so a run is recorded once
  // no matter whether it was cleared, failed, or given up.
  const endRun = useCallback(
    (endedRun, endedAt = Date.now()) => {
      setRun(endedRun)
      setScreen(SCREEN.RESULTS)

      const key = endedRun.runId ?? `${endedRun.source ?? ''}-${endedRun.startedAt ?? endedAt}`
      if (trackedRunId.current === key) return
      trackedRunId.current = key
      history.recordRun(endedRun, endedAt)
    },
    [setRun, history],
  )

  // The reason is optional: a skip with no reason given still records a skip,
  // it just has no breakdown in the leaderboard.
  const handleSkip = async (skipReason = null) => {
    if (!run || !run.currentLevel) return

    const endedAt = Date.now()
    const currentResult = createLevelResult({
      level: run.currentLevel,
      targetPercent: run.currentTarget,
      achievedPercent: null,
      result: 'skipped',
      startedAt: run.currentLevelStartedAt ?? endedAt,
      endedAt,
      skipReason,
    })

    const usedLevelIds = [...(run.usedLevelIds || []), run.currentLevel.id]
    const nextLevel = pickNextLevel(run.levels, usedLevelIds, run.allowDuplicates)
    const hydratedNextLevel = await hydrateLevelForRun(run, nextLevel)
    const updatedRun = {
      ...run,
      skippedCount: (run.skippedCount || 0) + 1,
      skipReasons: countSkipReason(run.skipReasons, currentResult.skipReason),
      rounds: [
        ...run.rounds,
        {
          ...currentResult,
          roundNumber: run.rounds.length + 1,
        },
      ],
      usedLevelIds,
      currentLevel: hydratedNextLevel,
      currentLevelStartedAt: Date.now(),
      status: 'active',
    }

    setRun(updatedRun)
  }

  const handleGiveUp = () => {
    if (!run) return

    const failedRun = {
      ...run,
      status: 'failed',
      endingPercent: run.currentTarget,
      gaveUp: true,
      gaveUpAt: Date.now(),
    }
    endRun(failedRun)
  }

  /* Ends a run because a time limit ran out, rather than because the player
     chose to. The level in progress is recorded as a timed-out round so it
     shows up in the leaderboard detail like any other level, and `timeUp` tells
     the results screen to explain that nobody pressed anything.

     `overBy` is the limit that expired, since the two can both be true at once
     and the results screen only has room for one headline. */
  const endRunOnTimeLimit = useCallback((overBy) => {
    if (!run || !run.currentLevel) return

    const endedAt = Date.now()
    const timedOut = createLevelResult({
      level: run.currentLevel,
      targetPercent: run.currentTarget,
      achievedPercent: null,
      result: 'timeout',
      startedAt: run.currentLevelStartedAt ?? endedAt,
      endedAt,
    })

    const expiredRun = {
      ...run,
      status: 'failed',
      timeUp: overBy,
      rounds: [...run.rounds, { ...timedOut, roundNumber: run.rounds.length + 1 }],
      usedLevelIds: [...(run.usedLevelIds || []), run.currentLevel.id],
      endingPercent: run.currentTarget,
      currentLevel: null,
    }

    endRun(expiredRun, endedAt)
  }, [run, endRun])

  /* Watches both clocks and ends the run when either expires.

     Kept here rather than in the run screen so the rule is enforced by the
     component that owns the run, and so it still applies after a reload: a
     saved run carries its own limits, so the timer picks up where it left off.
     The check runs on an interval rather than only between rounds, so a limit
     that expires mid-level stops the run promptly. */
  useEffect(() => {
    if (screen !== SCREEN.ROULETTE || !run || run.status !== 'active' || !run.currentLevel) {
      return undefined
    }

    const levelLimitMs = Number.isFinite(run.levelTimeLimitMs) ? run.levelTimeLimitMs : 0
    const totalLimitMs = Number.isFinite(run.totalTimeLimitMs) ? run.totalTimeLimitMs : 0
    if (levelLimitMs <= 0 && totalLimitMs <= 0) return undefined

    const check = () => {
      const levelElapsed = getElapsedLevelTimeMs({ startedAt: run.currentLevelStartedAt })
      if (levelLimitMs > 0 && levelElapsed >= levelLimitMs) {
        endRunOnTimeLimit('level')
        return
      }

      const totalElapsed = getRunElapsedMs({
        rounds: run.rounds,
        currentLevelStartedAt: run.currentLevelStartedAt,
      })
      if (totalLimitMs > 0 && totalElapsed >= totalLimitMs) {
        endRunOnTimeLimit('total')
      }
    }

    check()
    const intervalId = window.setInterval(check, 500)
    return () => window.clearInterval(intervalId)
  }, [screen, run, endRunOnTimeLimit])

  const handleRestart = () => {
    setRun(null)
    setSaveCode('')
    trackedRunId.current = null
    setScreen(SCREEN.HOME)
  }

  // Abandoning a run mid-game, as opposed to giving up on the current level.
  // Giving up ends the run, records it on the leaderboard and shows results;
  // quitting just discards it and returns to the menu, leaving no trace. That
  // distinction matters, so this deliberately does not route through endRun.
  const handleQuitRun = () => {
    setRun(null)
    setSaveCode('')
    trackedRunId.current = null
    setScreen(SCREEN.HOME)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <span className="brand-mark">DLR</span>
          <div>
            <strong>
              Made by{' '}
              <a
                href="https://gdbrowser.com/u/geometricalmike"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'white', textDecoration: 'none' }}
                onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                onMouseOut={(e) => e.target.style.textDecoration = 'none'}
              >
                GeometricalMike
              </a>
            </strong>
            <small>
              Dedicated to{' '}
              <a
                href="https://gdbrowser.com/u/vortrox"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'white', textDecoration: 'none' }}
                onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                onMouseOut={(e) => e.target.style.textDecoration = 'none'}
              >
                Vortrox
              </a>,{' '}
              <a
                href="https://gdbrowser.com/u/kingsammelot"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'white', textDecoration: 'none' }}
                onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                onMouseOut={(e) => e.target.style.textDecoration = 'none'}
              >
                KingSammelot
              </a>, and{' '}
              <a
                href="https://gdbrowser.com/u/zoink"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'white', textDecoration: 'none' }}
                onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                onMouseOut={(e) => e.target.style.textDecoration = 'none'}
              >
                Zoink
              </a>.
            </small>
          </div>
        </div>

        {screen !== SCREEN.HOME && run && (
          <div className="status-pill">
            <span>{run.status}</span>
            <strong>{currentStatus}</strong>
          </div>
        )}
      </header>

      {screen === SCREEN.HOME && (
        <HomePage
          onStart={startRun}
          history={history}
          onLoadRun={loadRunFromCode}
          onSaveRun={saveCurrentRun}
          run={run}
          savedRunCode={saveCode}
          gameRules={gameRules}
        />
      )}
      {screen === SCREEN.ROULETTE && run && (
        <RoulettePage
          run={run}
          onSuccess={(value) => finishRound(value)}
          onSkip={handleSkip}
          onGiveUp={handleGiveUp}
          onQuit={handleQuitRun}
          onSaveRun={saveCurrentRun}
          onLoadRun={loadRunFromCode}
          savedRunCode={saveCode}
        />
      )}
      {screen === SCREEN.RESULTS && run && (
        <ResultsPage
          run={run}
          onRestart={handleRestart}
          onSaveRun={saveCurrentRun}
          onLoadRun={loadRunFromCode}
          savedRunCode={saveCode}
        />
      )}
    </div>
  )
}

export default App
