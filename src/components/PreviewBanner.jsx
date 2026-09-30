import { endPreviewSession } from '../services/adminService'

/**
 * The preview banner.
 *
 * A moderator signed in as somebody else is looking at an account that is not
 * theirs, and everything on screen could be mistaken for their own -- a run
 * history, a settings page, a leaderboard with their name on it. So the whole
 * window is outlined in orange and the bar says who is being previewed and how to
 * get out of it.
 *
 * Fixed to the edges of the viewport and above everything, because the point is
 * that it cannot be scrolled past or covered by the panel. It is not a dismissible
 * notice: the only way to make it go away is to end the preview, which is what the
 * button does.
 */
export default function PreviewBanner({ username, onEnded }) {
  if (!username) {
    return null
  }

  const handleEnd = async () => {
    await endPreviewSession()
    onEnded?.()
  }

  return (
    <>
      <div className="preview-outline" aria-hidden="true" />
      <div className="preview-banner" role="status">
        <span className="preview-dot" aria-hidden="true" />
        <strong>Previewing {username}&rsquo;s account</strong>
        <span className="preview-note">
          You are signed in as them. Anything you do here is done as them.
        </span>
        <button type="button" className="preview-exit" onClick={handleEnd}>
          End preview
        </button>
      </div>
    </>
  )
}
