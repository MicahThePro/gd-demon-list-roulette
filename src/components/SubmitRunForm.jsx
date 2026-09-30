import { useState } from 'react'
import { uploadRecording } from '../services/submissionService'
import { CONTAINERS, SUGGESTED_HOSTS, getHostLabel, normalizeContainer, normalizeVideoUrl } from '../utils/videoFile'

/**
 * The global leaderboard submission form.
 *
 * Shared by the results screen and the local leaderboard's run detail, because
 * both are offering the same two things: a claim of who did the run, and a link
 * to the video that backs it. Keeping one copy means the rules -- sign in, list
 * must be ranked, video required, run stored before the proof -- cannot drift
 * apart between the two places a player might submit from.
 *
 * `getPayload` returns the run body to POST. It is a function rather than a run
 * object because the two callers hold different shapes: the results screen still
 * has the live run, while a leaderboard entry is a trimmed summary with packed
 * rounds. Neither the network order nor the validation is this component's
 * business; it just asks for the payload and reports what happened.
 */
export default function SubmitRunForm({
  getPayload,
  auth,
  isSubmittable,
  alreadySubmitted = false,
  intro,
  onSubmitted,
}) {
  const [status, setStatus] = useState({ state: 'idle', message: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [container, setContainer] = useState('mp4')
  const [note, setNote] = useState('')
  const [linkError, setLinkError] = useState('')
  const [linkOk, setLinkOk] = useState('')

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
    setStatus({ state: 'idle', message: 'Saving your run and sending the link for review.' })

    try {
      const saved = await getPayload()
      await uploadRecording({
        runId: saved.id,
        videoUrl: link.url,
        container,
        note: note.trim(),
      })

      setStatus({
        state: 'done',
        message: 'Submitted. Your run is waiting to be checked, and will appear on the global leaderboard once it is.',
      })
      onSubmitted?.(saved.id)
    } catch (error) {
      setStatus({ state: 'error', message: error?.message ?? 'Could not submit that run.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!auth.user) {
    return (
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
    )
  }

  if (alreadySubmitted) {
    return (
      <p className="settings-hint">
        This run is already in the moderation queue, so it does not need sending again. It will
        appear on the global leaderboard once somebody has watched the video.
      </p>
    )
  }

  if (!isSubmittable) {
    return (
      <p className="settings-hint">
        Runs on this list are not ranked. The leaderboard covers the five lists on the home
        screen.
      </p>
    )
  }

  return (
    <>
      {intro ?? (
        <p>
          Submit this run to the global leaderboard as <strong>@{auth.user.username}</strong>.
        </p>
      )}

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
      {status.message && (
        <p className={status.state === 'done' ? 'export-status' : 'validation-message'}>
          {status.message}
        </p>
      )}
    </>
  )
}
