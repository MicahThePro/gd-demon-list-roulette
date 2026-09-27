import { useEffect, useRef } from 'react'
import { MAX_PERCENT_STEP } from '../utils/roulette'

/**
 * The percentage-step setting, shown in a dialog like the What's new and quit
 * run popups rather than as an inline panel in the form.
 *
 * The draft is free to be empty so the field can be cleared while typing; the
 * real value only commits on blur, falling back to the minimum.
 *
 * There is no Cancel or Done button on purpose. Both would do exactly what
 * Close already does, and a Cancel that silently saves the change would be
 * actively misleading. The value commits as soon as the field loses focus, so
 * closing the dialog by any route keeps whatever was typed.
 */
export default function SettingsDialog({
  isOpen,
  onClose,
  percentStep,
  percentStepDraft,
  onDraftChange,
  onCommit,
  estimatedRounds,
}) {
  const closeRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return undefined

    // Escape cancels, and commits the field on the way out so a value the user
    // typed is never silently thrown away by closing with the keyboard.
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCommit()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    // Move focus into the dialog so keyboard and screen reader users land
    // inside it rather than staying back on the trigger button.
    closeRef.current?.focus()

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, onCommit])

  if (!isOpen) return null

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="changelog-head">
          <div>
            <p className="eyebrow">Settings</p>
            <h2 id="settings-title">Percentage increment</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="secondary-button changelog-close"
            onClick={() => {
              onCommit()
              onClose()
            }}
          >
            Close
          </button>
        </div>

        <div className="settings-dialog-body">
          <label className="settings-field">
            Percentage increment
            <input
              type="number"
              min="1"
              max={MAX_PERCENT_STEP}
              step="1"
              value={percentStepDraft}
              onChange={(event) => onDraftChange(event.target.value)}
              onBlur={onCommit}
              placeholder="1"
            />
          </label>

          <p className="settings-hint">
            Currently stepping up by +{percentStep}%, which means {estimatedRounds}{' '}
            {estimatedRounds === 1 ? 'level' : 'levels'} to finish a run.
          </p>
        </div>
      </div>
    </div>
  )
}
