import { useState } from 'react'
import { formatDurationMs } from '../utils/roulette'
import { SUBMITTABLE_SOURCES } from '../services/apiService'
import { submitRun, uploadRecording } from '../services/submissionService'
import { CONTAINERS, SUGGESTED_HOSTS, getHostLabel, normalizeContainer, normalizeVideoUrl } from '../utils/videoFile'

export default function ResultsPage({ run, onRestart, auth }) {
  const [submitState, setSubmitState] = useState({ status: 'idle', message: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [container, setContainer] = useState('mp4')
  const [note, setNote] = useState('')
  const [linkError, setLinkError] = useState('')
  const [linkOk, setLinkOk] = useState('')

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

  // The run is stored first and the video second. The run is off the public
  // board until the video is approved, so the worst case from a failure in the
  // middle is a pending run nobody can see, never an unvouched-for score.
  const handleSubmit = async () => {
    const link = normalizeVideoUrl(videoUrl)
    if (!link.ok) {
      setLinkError(link.error)
      return
    }

    setIsSubmitting(true)
    setSubmitState({
      status: 'idle',
      message: 'Saving your run and sending the link for review.',
    })

    try {
      const saved = await submitRun(run, Date.now())
      await uploadRecording({
        runId: saved.id,
        videoUrl: link.url,
        container,
        note: note.trim(),
      })

      setSubmitState({
        status: 'done',
        message: 'Submitted. Your run is waiting to be checked, and will appear on the global leaderboard once it is.',
      })
    } catch (error) {
      setSubmitState({
        status: 'error',
        message: error?.message ?? 'Could not submit that run.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Checked as the player types, so a paste that worked says so immediately
  // rather than only after a failed submit.
  const handleLinkChange = (value) => {
    setVideoUrl(value)
    setLinkOk('')
    if (!value.trim()) {
      setLinkError('')
      return
    }
    const result = normalizeVideoUrl(value)
    if (result.ok) {
      setLinkError('')
      setLinkOk(result.url)
    } else {
      setLinkOk('')
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

        <p className="results-section-label">Global leaderboard</p>
        <div className="submit-panel">
          {!auth.user ? (
            <>
              <p>
                Sign in and this run can be submitted to the global leaderboard, where everyone can
                see how far it got. It is optional: the run is already saved in this browser.
              </p>
              <p className="settings-hint">
                Signing in needs a username and a password. There is no email address, so nothing
                to lose and no waiting on a message.
              </p>
            </>
          ) : !isSubmittable ? (
            <p className="settings-hint">
              Runs on this list are not ranked. The leaderboard covers the five lists on the home
              screen.
            </p>
          ) : (
            <>
              <p>
                Submit this run to the global leaderboard as{' '}
                <strong>@{auth.user.username}</strong>.
              </p>
              <p className="settings-hint">
                A run has to have a video of it before it can go on the global leaderboard.
                Somebody watches the video first, so your run waits in the queue rather than
                appearing straight away.
              </p>

              <div className="submit-proof">
                <strong>1. Put your video somewhere</strong>
                <p className="settings-hint">
                  The site does not host video, so upload it somewhere you already have an account
                  and make it link shareable. Any of these work:
                </p>
                <ul className="host-list">
                  {SUGGESTED_HOSTS.map((host) => (
                    <li key={host.name}>
                      <strong>{host.name}</strong>
                      <span>{host.hint}</span>
                    </li>
                  ))}
                </ul>
                <p className="settings-hint">
                  Keep the video up until your run is approved. On YouTube, upload it as{' '}
                  <strong>Unlisted</strong> rather than public, so it stays off search and your
                  channel.
                </p>
              </div>

              <label className="submit-field">
                2. Paste the link
                <input
                  type="url"
                  inputMode="url"
                  value={videoUrl}
                  onChange={(event) => handleLinkChange(event.target.value)}
                  placeholder="https://drive.google.com/..."
                  disabled={isSubmitting}
                />
              </label>
              {linkError && <div className="validation-message">{linkError}</div>}
              {linkOk && (
                <p className="export-status">
                  Link looks good: {getHostLabel(linkOk)}
                </p>
              )}

              <label className="submit-field">
                3. What file is it?
                <select
                  value={container}
                  onChange={(event) => setContainer(normalizeContainer(event.target.value) ?? 'mp4')}
                  disabled={isSubmitting}
                >
                  {CONTAINERS.map((type) => (
                    <option key={type} value={type}>
                      {type.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <p className="settings-hint">
                WebM and MP4 open in a browser. MOV, AVI and MKV are accepted too, but the reviewer
                opens them in a video player rather than in the page.
              </p>

              <label className="submit-field">
                Anything to add? (optional)
                <input
                  type="text"
                  value={note}
                  maxLength={200}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="e.g. recorded with OBS, run starts at 1:20"
                  disabled={isSubmitting}
                />
              </label>

              <div className="action-row">
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleSubmit}
                  disabled={isSubmitting || !videoUrl.trim()}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit run'}
                </button>
              </div>
              {submitState.message && (
                <p className={submitState.status === 'done' ? 'export-status' : 'validation-message'}>
                  {submitState.message}
                </p>
              )}
            </>
          )}
        </div>

        <div className="action-row">
          <button className="secondary-button" type="button" onClick={onRestart}>
            New run
          </button>
        </div>
      </section>
    </main>
  )
}
