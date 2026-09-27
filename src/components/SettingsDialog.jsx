import { useEffect, useRef, useState } from 'react'
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
  const inputRef = useRef(null)
  const closeRef = useRef(null)
  // The dialog is the same component across opens, so a ref carries whether the
  // user has already dismissed the "what's new" hint for this visit. It is not
  // worth being told twice, but it is worth being told at least once.
  const [hasSeenHint, setHasSeenHint] = useState(false)

  useEffect(() => {
    if (!isOpen) return undefined

    // Escape commits and closes.
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCommit()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    // Focus the input, not the Close button. Focusing the button meant the
    // first keypress went to a button rather than the field, and Backspace
    // appeared to do nothing.
    inputRef.current?.focus()
    inputRef.current?.select()

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, onCommit])

  // Roving focus inside the dialog: Tab and Shift+Tab cycle the input and the
  // close button instead of escaping to the page behind. Native dialogs trap
  // focus; a div with role="dialog" does not, so this has to be done by hand.
  const handleKeyDownForFocus = (event) => {
    if (event.key !== 'Tab') return

    const focusables = [inputRef.current, closeRef.current].filter(Boolean)
    if (!focusables.length) return

    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDownForFocus}
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
              setHasSeenHint(true)
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
              ref={inputRef}
              type="number"
              min="1"
              max={MAX_PERCENT_STEP}
              step="1"
              value={percentStepDraft}
              onChange={(event) => onDraftChange(event.target.value)}
              onBlur={() => {
                setHasSeenHint(true)
                onCommit()
              }}
              placeholder="1"
            />
          </label>

          <p className="settings-hint">
            Currently stepping up by +{percentStep}%, which means {estimatedRounds}{' '}
            {estimatedRounds === 1 ? 'level' : 'levels'} to finish a run.
          </p>

          {!hasSeenHint && (
            <p className="settings-note">
              Saved as soon as you click away, so pressing Close keeps whatever you
              typed.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
