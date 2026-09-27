import { useEffect, useRef } from 'react'
import { CHANGELOG, LATEST_VERSION } from '../data/changelog'

const NEW_BADGE = 'New'

/**
 * The site history dialog. Opened from the main menu, and closable with Escape,
 * a click on the backdrop, or the close button.
 */
export default function ChangelogDialog({ isOpen, onClose }) {
  const closeRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return undefined

    // Escape cancels, as expected of a dialog.
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)

    // Move focus into the dialog so keyboard and screen reader users land
    // inside it rather than staying back on the trigger button.
    closeRef.current?.focus()

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal changelog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="changelog-head">
          <div>
            <p className="eyebrow">Changelog</p>
            <h2 id="changelog-title">What's new</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="secondary-button changelog-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="changelog-list">
          {CHANGELOG.map((release, index) => (
            <section key={release.id} className="changelog-entry">
              <div className="changelog-entry-head">
                <span className="changelog-version">{release.version}</span>
                {index === 0 && <span className="changelog-new">{NEW_BADGE}</span>}
              </div>
              <h3>{release.title}</h3>
              <p className="changelog-summary">{release.summary}</p>
              <ul>
                {release.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="changelog-foot">
          Latest version {LATEST_VERSION}. Everything here is stored in your browser; no
          account and nothing is sent anywhere.
        </p>
      </div>
    </div>
  )
}
