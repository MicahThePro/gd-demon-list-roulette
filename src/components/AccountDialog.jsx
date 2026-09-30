import { useState } from 'react'

const MIN_PASSWORD_LENGTH = 8

/**
 * Sign in, sign up and account summary, in one dialog.
 *
 * Deliberately one dialog with two modes rather than two dialogs: switching
 * between them is the common path, and reopening the dialog to do it would be
 * an extra click for no gain. The form is a plain form so Enter submits and the
 * browser handles the field types.
 *
 * The fields are cleared when the dialog closes rather than in an effect on
 * open, so closing and reopening does not run a render-then-update cycle, and a
 * stale error from a failed attempt never greets the next attempt.
 */
export default function AccountDialog({ isOpen, onClose, auth }) {
  const { user, isRestoring, isBusy, error, setError, signIn, signUp, signOut } = auth
  const [mode, setMode] = useState('signin')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')

  const handleClose = () => {
    setPassword('')
    setError('')
    onClose()
  }

  if (!isOpen) {
    return null
  }

  const isSignUp = mode === 'signup'
  const canSubmit =
    username.trim().length >= 3 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    !isBusy

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSubmit) {
      return
    }

    const result = isSignUp
      ? await signUp({ username: username.trim(), password, displayName: displayName.trim() })
      : await signIn({ username: username.trim(), password })

    if (result.ok) {
      handleClose()
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleClose}>
      <div
        className="modal account-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Your account"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-actions">
          <h2>{user ? 'Your account' : isSignUp ? 'Create an account' : 'Sign in'}</h2>
          <button type="button" className="secondary-button small-button" onClick={handleClose}>
            Close
          </button>
        </div>

        {isRestoring && !user && <p className="settings-note">Checking your saved sign in...</p>}

        {user ? (
          <div className="account-panel">
            <p className="account-name">{user.displayName}</p>
            <p className="settings-note">
              Signed in as <strong>@{user.username}</strong>. Your runs are submitted from the
              results screen and appear on the global leaderboard.
            </p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={signOut}>
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <form className="account-form" onSubmit={handleSubmit}>
            <label>
              Username
              <input
                type="text"
                value={username}
                autoComplete="username"
                maxLength={20}
                onChange={(event) => {
                  setUsername(event.target.value)
                  setError('')
                }}
                placeholder="letters, numbers, dots or underscores"
              />
            </label>

            {isSignUp && (
              <label>
                Display name
                <input
                  type="text"
                  value={displayName}
                  autoComplete="nickname"
                  maxLength={40}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="optional, shown on the leaderboard"
                />
              </label>
            )}

            <label>
              Password
              <input
                type="password"
                value={password}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                maxLength={200}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setError('')
                }}
                placeholder={isSignUp ? `at least ${MIN_PASSWORD_LENGTH} characters` : ''}
              />
            </label>

            {isSignUp && (
              <p className="settings-hint">
                Your password is hashed on the server and never stored in readable form. The
                session is a token in this browser only, so there is no email address to lose.
              </p>
            )}

            {error && <div className="validation-message">{error}</div>}

            <div className="modal-actions">
              <button type="submit" className="primary-button" disabled={!canSubmit}>
                {isBusy ? 'Working...' : isSignUp ? 'Create account' : 'Sign in'}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setMode(isSignUp ? 'signin' : 'signup')
                  setError('')
                }}
              >
                {isSignUp ? 'I already have an account' : 'Create an account'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
