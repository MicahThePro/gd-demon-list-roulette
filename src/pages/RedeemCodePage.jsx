import { useState } from 'react'
import { redeemLoginCode } from '../services/adminService'

/**
 * Redeems a one-time login code and signs this browser in as that player.
 *
 * A moderation tool, so it is a page of its own rather than something tucked
 * into a menu. It says plainly what redeeming does, because the code is the
 * credential and there is no password involved: a moderator who redeems one is
 * signed in as that player until they sign out, and the code cannot be used
 * again afterwards.
 */
export default function RedeemCodePage({ onExit, onRedeemed }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isWorking, setIsWorking] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!code.trim()) {
      setError('Paste a login code.')
      return
    }

    setIsWorking(true)
    setError('')
    try {
      const user = await redeemLoginCode(code)
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
        <h2>Use a login code</h2>
        <form onSubmit={handleSubmit}>
          <p className="settings-hint">
            A code is issued from the admin panel, on an account, and signs this
            browser in as that player. It works once: as soon as it is used it
            cannot be used again, and signing out ends the session.
          </p>
          <label className="admin-note">
            Login code
            <input
              type="text"
              value={code}
              onChange={(event) => {
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
            <button type="submit" className="primary-button" disabled={isWorking}>
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
