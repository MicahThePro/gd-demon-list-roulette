import { useEffect, useRef, useState } from 'react'

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
  allowSkip,
  onAllowSkipChange,
  levelTimeLimitDraft,
  onLevelTimeLimitDraftChange,
  onCommitLevelTimeLimit,
  totalTimeLimitDraft,
  onTotalTimeLimitDraftChange,
  onCommitTotalTimeLimit,
  isMasked,
  onIsMaskedChange,
}) {
  const inputRef = useRef(null)
  const closeRef = useRef(null)
  const dialogRef = useRef(null)
  // The dialog is the same component across opens, so a ref carries whether the
  // user has already dismissed the "what's new" hint for this visit. It is not
  // worth being told twice, but it is worth being told at least once.
  const [hasSeenHint, setHasSeenHint] = useState(false)

  useEffect(() => {
    if (!isOpen) return undefined

    // Escape commits and closes. Every control commits on the way out, not just
    // the percentage step, so closing the dialog never silently discards a time
    // limit that was typed but not yet blurred.
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCommit()
        onCommitLevelTimeLimit()
        onCommitTotalTimeLimit()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    // Focus the input, not the Close button, so typing goes to the field.
    // The caret is deliberately NOT moved to the end and the text is NOT
    // selected: selecting made the first keystroke replace the whole value, so
    // typing a second digit was impossible without clicking first.
    inputRef.current?.focus()

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, onCommit, onCommitLevelTimeLimit, onCommitTotalTimeLimit])

  // Roving focus inside the dialog: Tab and Shift+Tab cycle the input and the
  // close button instead of escaping to the page behind. Native dialogs trap
  // focus; a div with role="dialog" does not, so this has to be done by hand.
  const handleKeyDownForFocus = (event) => {
    if (event.key !== 'Tab') return

    // Collected from the live DOM rather than a hand-kept list of refs, so a
    // control added later is trapped automatically instead of needing to be
    // remembered in two places. Only genuinely focusable, visible controls
    // count, which is why disabled and hidden elements are filtered out.
    const focusables = Array.from(
      dialogRef.current?.querySelectorAll(
        'input:not([type="checkbox"]), button:not([disabled])',
      ) ?? [],
    )
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
        ref={dialogRef}
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
            <h2 id="settings-title">Run settings</h2>
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
              type="text"
              inputMode="numeric"
              value={percentStepDraft}
              onChange={(event) => onDraftChange(event.target.value.replace(/[^0-9]/g, ''))}
              onBlur={() => {
                setHasSeenHint(true)
                onCommit()
              }}
              placeholder="1"
              aria-describedby="settings-step-hint"
            />
          </label>

          <p className="settings-hint" id="settings-step-hint">
            Currently stepping up by +{percentStep}%, which means {estimatedRounds}{' '}
            {estimatedRounds === 1 ? 'level' : 'levels'} to finish a run.
          </p>

          {!hasSeenHint && (
            <p className="settings-note">
              Saved as soon as you click away, so pressing Close keeps whatever you
              typed.
            </p>
          )}

          <hr className="settings-divider" />

          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={allowSkip}
              onChange={(event) => onAllowSkipChange(event.target.checked)}
            />
            <span>
              <strong>Allow skipping</strong>
              <small>
                When this is off, the Skip button is gone and a level you cannot
                beat ends the run.
              </small>
            </span>
          </label>

          <hr className="settings-divider" />

          <label className="settings-field">
            Time limit per level (minutes)
            <input
              type="text"
              inputMode="numeric"
              value={levelTimeLimitDraft}
              onChange={(event) => onLevelTimeLimitDraftChange(event.target.value.replace(/[^0-9]/g, ''))}
              onBlur={onCommitLevelTimeLimit}
              placeholder="0"
              aria-describedby="settings-level-limit-hint"
            />
          </label>

          <p className="settings-hint" id="settings-level-limit-hint">
            {levelTimeLimitDraft === '' || Number(levelTimeLimitDraft) === 0
              ? 'Off. You can spend as long as you like on each level.'
              : 'Running out of time on a level ends the run right there.'}
          </p>

          <label className="settings-field">
            Time limit for the whole run (minutes)
            <input
              type="text"
              inputMode="numeric"
              value={totalTimeLimitDraft}
              onChange={(event) => onTotalTimeLimitDraftChange(event.target.value.replace(/[^0-9]/g, ''))}
              onBlur={onCommitTotalTimeLimit}
              placeholder="0"
              aria-describedby="settings-total-limit-hint"
            />
          </label>

          <p className="settings-hint" id="settings-total-limit-hint">
            {totalTimeLimitDraft === '' || Number(totalTimeLimitDraft) === 0
              ? 'Off. The run only ends when you finish, fail or give up.'
              : 'A speedrun: see how many levels you can clear before the clock runs out.'}
          </p>

          <hr className="settings-divider" />

          {/* The mask, and the only setting here that changes what a player reads rather
              than how a run behaves.

              Kept to one line each on purpose. A warning that runs to a paragraph
              stops being read as a warning and starts being furniture, and the
              point here is only ever "these names can contain swearing" -- which
              fits in a sentence, and which stays visible rather than needing a
              confirm the player can dismiss and forget. */}
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={!isMasked}
              onChange={(event) => onIsMaskedChange(!event.target.checked)}
            />
            <span>
              <strong>Show uncensored level names</strong>
              <small>Some level names contain a swear word. Off is the default.</small>
            </span>
          </label>

          {!isMasked && (
            <p className="settings-censor-warning">
              Uncensored names are on, so level names may contain profanity — including
              in runs you send in.
            </p>
          )}

          <p className="settings-note">
            The run rules above are saved to this browser and are locked in when a run
            starts, so changing them mid-run will not affect the run you are playing.
            The mask is not a run rule, so it applies straight away.
          </p>
        </div>
      </div>
    </div>
  )
}
