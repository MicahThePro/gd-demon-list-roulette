import { useState } from 'react'
import { redeemLoginCode } from '../services/adminService'

/**
 * Signs this browser in as a player, using a one-time code from the admin panel.
 *
 * A moderation tool, so it is a page of its own rather than something tucked
 * into a menu. It says plainly what this does, because the code is the whole
 * credential and no password is involved: a moderator who uses one is signed in
 * as that player until they sign out, and the code stops working the moment it
 * is used.
 *
 * Username plus code, rather than the code alone. It matches what the form on the
 * home screen asks for, so a moderator is typing the two things they already
 * have in front of them, and it means a code pasted into the wrong account's row
 * is refused instead of quietly signing in as somebody else.
 */
export default function RedeemCodePage({ onExit, onRedeemed }) {
  const [username, setUsername] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isWorking, setIsWorking] = useState(false)

  const canSubmit = username.trim().length >= 3 && code.trim().length > 0 && !isWorking

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSubmit) {
      return
    }

    setIsWorking(true)
    setError('')
    try {
      const user = await redeemLoginCode({ username: username.trim(), code })
      onRedeemed?.(user)
    } catch (caught) {
      setError(caught?.message ?? 'Could not use that code.')
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <main className="page-shell admin-page">
      <section className="panel admin-gate">
        <p className="eyebrow">Preview</p>
        <h2>Sign in as a player</h2>
        <form onSubmit={handleSubmit}>
          <p className="settings-hint">
            A code is issued from the admin panel, on an account. Enter that
            account&rsquo;s username with the code to sign this browser in as them.
            It works once: the moment it is used it cannot be used again, and
            signing out ends the session.
          </p>

          <label className="admin-note">
            Username
            <input
              type="text"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value)
                setError('')
              }}
              placeholder="their username"
              autoComplete="off"
              spellCheck="false"
            />
          </label>

          <label className="admin-note">
            Login code
            <input
              type="text"
              value={code}
              onChange={(event) => {
                // Uppercased as it is typed, so the alphabet stays unambiguous
                // and a lower-case paste cannot be rejected for being lower case.
                setCode(event.target.value.toUpperCase())
                setError('')
              }}
              placeholder="ABCDE FGHJ KLMNP"
              autoFocus
              autoComplete="off"
              spellCheck="false"
            />
          </label>

          {error && <div className="validation-message">{error}</div>}

          <div className="action-row">
            <button type="submit" className="primary-button" disabled={!canSubmit}>
              {isWorking ? 'Signing in...' : 'Sign in as that player'}
            </button>
            <button type="button" className="secondary-button" onClick={onExit}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
