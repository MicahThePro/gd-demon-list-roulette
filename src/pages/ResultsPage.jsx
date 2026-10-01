import { useState } from 'react'
import { formatDurationMs } from '../utils/roulette'
import { SUBMITTABLE_SOURCES } from '../services/apiService'
import { saveRunToAccount, submitRun } from '../services/submissionService'
import { hasSavedToAccount, hasSubmitted, markSavedToAccount } from '../utils/submittedRuns'
import AccountDialog from '../components/AccountDialog'
import SubmitRunForm from '../components/SubmitRunForm'

/**
 * The end-of-run panel: sign in to keep the run, then submit it for the board.
 *
 * The order is deliberate. Signing in is the first thing offered because it is
 * what makes the run survive -- a run held only in this browser is lost with the
 * browser, and a run on the account is on whichever device signs in next. The
 * dialog is the same one the home screen uses, and signing in from here saves the
 * run to the account rather than offering to: the player came here from a run, so
 * keeping it is the only reason they are here, and a question about it is a
 * question about something they have already decided.
 */
export default function ResultsPage({ run, runKey, onRestart, auth, onAccountChanged, onSignedOut }) {
  // The key the server groups a run under. Passed down rather than derived
  // here, because it has to be the same string the run was recorded under in the
  // local leaderboard: anything recomputed on this render (a fresh Date.now(),
  // say) would differ every time and the guard would never match.
  const [isSubmitted, setIsSubmitted] = useState(() => Boolean(runKey) && hasSubmitted(runKey))
  // Whether this run is on the account. Asked of local storage rather than the
  // server, because the answer only changes through this panel: signing in
  // offers to save it, and saving it is the only other thing that can.
  const [isSavedToAccount, setIsSavedToAccount] = useState(() => Boolean(runKey) && hasSavedToAccount(runKey))
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const [saveState, setSaveState] = useState({ state: 'idle', message: '' })
  const [isSaving, setIsSaving] = useState(false)
  if (!run) {
    return null
  }

  const finalPercent = run.endingPercent ?? run.startingPercent
  const completed = run.status === 'completed'

  const timedRounds = run.rounds.filter((round) => Number.isFinite(round.elapsedMs))
  const averageTimeMs =
    timedRounds.length > 0
      ? timedRounds.reduce((total, round) => total + round.elapsedMs, 0) / timedRounds.length
      : null
  const averageTimeLabel = averageTimeMs == null ? '--:--' : formatDurationMs(averageTimeMs)

  const gaveUp = run.gaveUp === true
  // Set by the time-limit watcher rather than by a button, so the results page
  // has to explain that the clock ended the run and nobody chose to quit.
  const timeUp = run.timeUp === 'level' || run.timeUp === 'total'
  const finalLevel = run.currentLevel

  const finalLevelElapsedMs =
    gaveUp && finalLevel && Number.isFinite(run.currentLevelStartedAt) && Number.isFinite(run.gaveUpAt)
      ? Math.max(0, run.gaveUpAt - run.currentLevelStartedAt)
      : null

  const finalLevelTimeLabel =
    finalLevelElapsedMs == null || finalLevelElapsedMs < 1000
      ? '0:00'
      : formatDurationMs(finalLevelElapsedMs)

  const historyRounds = gaveUp && finalLevel ? [...run.rounds, { final: true, level: finalLevel }] : run.rounds

  // Only lists the Worker will accept a run for. A run on any other source is
  // still fully playable, it just cannot be ranked, so the panel says so rather
  // than showing a button that would fail.
  const isSubmittable = SUBMITTABLE_SOURCES.includes(run.source)

  // The run is stored first and the video second, and both are handled by the
  // shared form, which the local leaderboard's run detail also uses. It asks for
  // the run body rather than being handed one, because the leaderboard holds a
  // trimmed entry and only this page still has the live run.
  const getPayload = () => submitRun(run, Date.now())

  /* Puts the run on the signed-in account, with nothing else attached. A run on
     the account is stored like any other run: it is on the player's board on
     every device, and it can be submitted for the global leaderboard later. The
     same endpoint the submission form posts to, so the two cannot produce
     different rows for the same run. */
  const handleSaveToAccount = async () => {
    if (isSaving) return
    setIsSaving(true)
    setSaveState({ state: 'idle', message: 'Saving this run to your account...' })
    try {
      await saveRunToAccount(run, Date.now())
      if (runKey) markSavedToAccount(runKey)
      setIsSavedToAccount(true)
      setSaveState({
        state: 'done',
        message: 'Saved. This run is on your account, so it is here on any device you sign in on.',
      })
      // Tells the app to re-read the account's runs, so the board on the home
      // screen includes this one without a reload.
      onAccountChanged?.()
    } catch (error) {
      setSaveState({ state: 'error', message: error?.message ?? 'Could not save this run.' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="page-shell results-page">
      <section className="panel results-panel">
        <p className="eyebrow">Run summary</p>
        <h2>
          {completed
            ? 'Roulette complete'
            : timeUp
              ? 'Out of time'
              : gaveUp
                ? 'You gave up'
                : 'Run ended'}
        </h2>

        {timeUp && (
          <p className="validation-message">
            {run.timeUp === 'level'
              ? 'You ran out of time on that level, so the run ended there.'
              : 'You ran out of time for the whole run, so it ended there.'}
          </p>
        )}

        <p className="results-section-label">Outcome</p>
        <div className="stats-grid">
          <div className="stat-card result-card">
            <span>Final %</span>
            <strong>{finalPercent}%</strong>
          </div>
          <div className="stat-card result-card">
            <span>Status</span>
            <strong>
              {completed ? 'Cleared' : timeUp ? 'Out of time' : gaveUp ? 'Gave up' : 'Failed'}
            </strong>
          </div>
          <div className="stat-card result-card">
            <span>Rounds</span>
            <strong>{run.rounds.length}</strong>
          </div>
        </div>

        <p className="results-section-label">Run details</p>
        <div className="stats-grid">
          <div className="stat-card result-card">
            <span>Average time / level</span>
            <strong>{averageTimeLabel}</strong>
          </div>
          <div className="stat-card result-card">
            <span>Target</span>
            <strong>{run.currentTarget}%</strong>
          </div>
          <div className="stat-card result-card">
            <span>Skips</span>
            <strong>{run.skippedCount || 0}</strong>
          </div>
          <div className="stat-card result-card">
            <span>Source</span>
            <strong className="stat-value-small">{run.source}</strong>
          </div>
        </div>

        <p className="results-section-label">
          {gaveUp ? 'Level you gave up on' : 'Round history'}
        </p>

        <div className="history-list">
          {historyRounds.length === 0 ? (
            <p>No rounds were completed.</p>
          ) : (
            historyRounds.map((round, index) => {
              const isFinal = round.final === true
              const result = isFinal ? 'gaveup' : round.result
              const timeLabel = isFinal
                ? finalLevelTimeLabel
                : (round.elapsedLabel ?? (round.elapsedMs != null ? formatDurationMs(round.elapsedMs) : '--:--'))
              const detail = isFinal
                ? `${round.level.targetPercent ?? run.currentTarget}% was required`
                : result === 'timeout'
                  ? `Ran out of time at ${round.targetPercent ?? run.currentTarget}%`
                  : round.achievedPercent == null
                    ? 'No attempt'
                    : `${round.achievedPercent}% achieved`
              const resultLabel =
                result === 'success'
                  ? 'Passed'
                  : result === 'skipped'
                    ? 'Skipped'
                    : result === 'gaveup'
                      ? 'Gave up'
                      : result === 'timeout'
                        ? 'Timed out'
                        : 'Failed'

              return (
                <div
                  key={`${round.level.id}-${index}`}
                  className={isFinal ? 'history-item history-item-final' : 'history-item'}
                >
                  {round.level.thumbnail ? (
                    <img
                      className="history-thumb"
                      src={round.level.thumbnail}
                      alt={`${round.level.name} thumbnail`}
                      loading="lazy"
                    />
                  ) : null}
                  <span className="history-index">#{index + 1}</span>
                  <span className="history-copy">
                    <strong>{round.level.name}</strong>
                    <small>{detail}</small>
                  </span>
                  <em className={`history-result history-result-${result}`}>{resultLabel}</em>
                  <small className="history-time">{timeLabel}</small>
                </div>
              )
            })
          )}
        </div>

        <p className="results-section-label">Keep this run</p>
        <div className="submit-panel">
          {auth.user ? (
            isSavedToAccount ? (
              <p className="export-status">
                This run is on your account as <strong>@{auth.user.username}</strong>. It appears on
                your board here and on any other device you sign in on.
              </p>
            ) : (
              <>
                <p>
                  Save this run to <strong>@{auth.user.username}</strong> so it follows you to
                  other devices. It is not on the global leaderboard until you send it for review
                  below.
                </p>
                <div className="action-row">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleSaveToAccount}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save to my account'}
                  </button>
                </div>
                {saveState.message && (
                  <p className={saveState.state === 'done' ? 'export-status' : 'validation-message'}>
                    {saveState.message}
                  </p>
                )}
              </>
            )
          ) : (
            <>
              <p>
                <strong>Sign in to save this run.</strong> An account is what keeps your runs:
                sign in on another device and everything you have played is there, instead of
                only in this browser.
              </p>
              <p className="settings-hint">
                You can sign in or create an account right here, and the run you just finished is
                saved to it straight away. Either way the run is already recorded on this device,
                so nothing is lost if you do not.
              </p>
              <div className="action-row">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setIsAccountOpen(true)}
                >
                  Sign in or create an account
                </button>
              </div>
            </>
          )}
        </div>

        <p className="results-section-label">Global leaderboard</p>
        <div className="submit-panel">
          <SubmitRunForm
            auth={auth}
            isSubmittable={isSubmittable}
            alreadySubmitted={isSubmitted}
            getPayload={getPayload}
            runKey={runKey}
            onSubmitted={() => setIsSubmitted(true)}
          />
        </div>

        <div className="action-row">
          <button className="secondary-button" type="button" onClick={onRestart}>
            New run
          </button>
        </div>
      </section>

      {/* The same account dialog the home screen opens. `onAuthenticated` runs
          after a successful sign in or sign up, and the run in hand is saved to
          the account rather than offered to it: the run is why this dialog is
          open, so there is nothing to ask about it. */}
      <AccountDialog
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
        auth={auth}
        pendingRun={run}
        onSignedOut={onSignedOut}
        onAuthenticated={async (_user, { attachRun }) => {
          setIsAccountOpen(false)
          onAccountChanged?.()
          /* Nothing to decide any more: signing in from here is signing in to keep
             this run, so it is saved without being asked about. The `attachRun`
             branch stays because the account dialog also opens from the home
             screen with no run in hand, where there is nothing to save. */
          if (!attachRun) return
          await handleSaveToAccount()
        }}
      />
    </main>
  )
}
