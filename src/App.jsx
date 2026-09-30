import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import HomePage from './pages/HomePage'
import RoulettePage from './pages/RoulettePage'
import ResultsPage from './pages/ResultsPage'
import { usePersistentRun } from './hooks/usePersistentRun'
import { useRunHistory } from './hooks/useRunHistory'
import { useAuth } from './hooks/useAuth'
import { useGameRules, timeLimitMinutesToMs } from './hooks/useGameRules'
import PreviewBanner from './components/PreviewBanner'
import RedeemCodePage from './pages/RedeemCodePage'
import { getPreviewUser, syncPlayerData } from './services/adminService'
import { fetchMyEntries } from './services/apiService'
import { fetchAredlLevelDetails, fetchImpossibleLevelDetails, fetchList } from './services/listService'
import { clampPercent, createRun, createLevelResult, countSkipReason, decodeRunState, encodeRunState, getElapsedLevelTimeMs, getRunElapsedMs, getNextTargetPercent, normalizePercentStep, pickNextLevel, summarizeResult } from './utils/roulette'
import { SITE_NAME, LATEST_VERSION } from './data/changelog'
import './App.css'

const SCREEN = {
  HOME: 'home',
  ROULETTE: 'roulette',
  RESULTS: 'results',
  REDEEM: 'redeem',
}

/* The player's own settings, read straight out of the cookies the rules hook
   writes, for the mirror a moderator can see.
 *
 * Read from the cookie rather than from the hook because the mirror is about what
 * is actually stored for the account, not about what the current page happens to
 * have in memory, and a missing cookie is simply a rule left at its default. */
const readCookieValue = (name) => {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

const readStoredSettings = () => ({
  allowSkip: readCookieValue('demon-roulette-allow-skip'),
  levelTimeLimit: readCookieValue('demon-roulette-level-time-limit'),
  totalTimeLimit: readCookieValue('demon-roulette-total-time-limit'),
  listSource: readCookieValue('demon-roulette-list-source'),
  percentStep: readCookieValue('demon-roulette-percent-step'),
})

// The moderation panel is NOT a route in this app. It is its own entry point at
// /admin, built from admin/index.html into admin/index.html in the output,
// because GitHub Pages is a static host with no server to rewrite a path into
// the main page: a client-side route there returns GitHub's 404. See
// src/adminMain.jsx.

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
  // The redeem page is reached as /redeem, a real path rather than a state, so a
  // moderator can bookmark it or have the admin panel link straight to it. GitHub
  // Pages cannot rewrite an unknown path into this app, so it is only honoured
  // when the file was actually served -- which is why it has to be its own
  // directory like the admin panel is. Read once at startup rather than in an
  // effect, so the right screen is on the first paint instead of a frame later.
  const [screen, setScreen] = useState(() =>
    typeof window !== 'undefined' && /\/redeem\/?$/.test(window.location.pathname)
      ? SCREEN.REDEEM
      : SCREEN.HOME,
  )
  const [run, setRun] = usePersistentRun()
  const gameRules = useGameRules()
  const history = useRunHistory()
  const auth = useAuth()
  // Identifies the run being played, so an ended run is recorded exactly once
  // even though several code paths reach the results screen.
  const trackedRunId = useRef(null)
  // The key of the run on the results screen, kept so the submission guard can
  // recognise a run that was already sent. State rather than the ref above,
  // because changing it has to re-render the results page.
  const [resultRunKey, setResultRunKey] = useState('')
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
      // The same key the submission guard uses, so the results screen and the
      // leaderboard row agree on which run this is.
      setResultRunKey(key)
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

  /* Previewing another account.
   *
   * A moderator redeems a one-time code and is signed in as that player. Every
   * screen then shows that player's data under that player's name, which is the
   * point, and also a way to be deceived by it, so the banner is pinned over the
   * whole app and stays up until the preview is explicitly ended.
   *
   * The username is read from localStorage rather than kept in state, because a
   * reload happens -- opening a redeem code in a new tab lands here first -- and
   * the banner must not quietly disappear across one. */
  const [previewUser, setPreviewUser] = useState(() => getPreviewUser())

  // The player data mirror. A signed-in player uploads their history and settings
  // so a moderator can see what the account holds; the browser stays the source
  // of truth and this is a copy, so a failure is logged and otherwise ignored.
  useEffect(() => {
    if (!auth.user) {
      return undefined
    }

    const controller = new AbortController()
    const timer = setTimeout(() => {
      syncPlayerData({
        history: history.entries,
        settings: readStoredSettings(),
      }).catch(() => {
        // A preview's data is a moderator's own upload going to another account,
        // and a mirror that did not write is not worth interrupting anyone over.
      })
    }, 1500)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // Re-runs when the history or the signed-in player changes, so the mirror is
    // not left holding whatever it had at sign in.
  }, [auth.user, history.entries])

  /* A signed-in player's leaderboard is the account's, not the device's.
   *
   * Signing in replaces what is on screen with the runs the account holds, so
   * the same account on another device shows the same board; and the server also
   * reports the keys of any runs a moderator has trashed, which are removed from
   * this browser's copy too. Signing out does nothing here on purpose: the board
   * falls back to the runs this browser recorded itself, and quietly emptying
   * somebody's leaderboard because they signed out would be a worse surprise than
   * leaving their last board up.
   *
   * `nonce` is bumped by the results screen after it saves a run, so the run just
   * added to the account shows up on the board without a reload. The request
   * itself is the only thing that changes what the hook holds, and it is applied
   * from its own callback rather than from the effect body. */
  const [accountNonce, setAccountNonce] = useState(0)
  // The apply function in a ref rather than in the dependency list: the hook
  // returns a new callback object on every render, so depending on it directly
  // would re-read the account after every unrelated render.
  const applyAccountEntries = useRef(history.applyAccountEntries)

  useEffect(() => {
    applyAccountEntries.current = history.applyAccountEntries
  }, [history.applyAccountEntries])

  useEffect(() => {
    if (!auth.user) {
      return undefined
    }

    const controller = new AbortController()
    const read = () => {
      fetchMyEntries(controller.signal)
        .then((payload) => {
          if (controller.signal.aborted) return
          applyAccountEntries.current(payload)
        })
        .catch(() => {
          // A sync that did not write is not worth interrupting anybody over: the
          // board keeps whatever it had, and the next read tries again.
        })
    }

    read()

    /* Re-read on an interval, so a run trashed by a moderator disappears from the
     * player's board while they are looking at it.
     *
     * Without this, trashing is only visible on the next page load, which is not
     * the same promise: the moderation queue is judged on whether a run is off
     * the site, and "off the site as soon as they next reload" is a weaker thing
     * than it sounds to somebody waiting to check.
     *
     * Not while the tab is hidden -- re-reading a background tab costs a request
     * to find out nothing changed, and the read happens on focus anyway. The
     * interval is deliberately long for the same reason: this is a backstop for a
     * rare event, not a live feed, and a burst of requests from every open tab
     * would be a poor trade for a change made a few times a day. */
    const POLL_MS = 60_000
    let intervalId = null

    const startPolling = () => {
      if (intervalId !== null) return
      intervalId = window.setInterval(() => {
        if (document.visibilityState === 'visible') read()
      }, POLL_MS)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') read()
    }

    if (document.visibilityState === 'visible') {
      startPolling()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (intervalId !== null) window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibility)
      controller.abort()
    }
  }, [auth.user, accountNonce])

  return (
    <div className={previewUser ? 'app-shell preview-active' : 'app-shell'}>
      <PreviewBanner
        username={previewUser}
        onEnded={() => {
          setPreviewUser(null)
          // The session went with the preview, so the app's own copy of the
          // player has to go too or the header keeps showing a dead account.
          auth.forgetUser()
        }}
      />
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

      {screen === SCREEN.REDEEM && (
        <RedeemCodePage
          onExit={() => setScreen(SCREEN.HOME)}
          onRedeemed={(user) => {
            setPreviewUser(user.username)
            setScreen(SCREEN.HOME)
          }}
        />
      )}
      {screen === SCREEN.HOME && (
        <HomePage
          onStart={startRun}
          history={history}
          onLoadRun={loadRunFromCode}
          onSaveRun={saveCurrentRun}
          run={run}
          savedRunCode={saveCode}
          gameRules={gameRules}
          auth={auth}
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
          runKey={resultRunKey}
          onRestart={handleRestart}
          onSaveRun={saveCurrentRun}
          onLoadRun={loadRunFromCode}
          savedRunCode={saveCode}
          auth={auth}
          onAccountChanged={() => setAccountNonce((value) => value + 1)}
        />
      )}
    </div>
  )
}

export default App
