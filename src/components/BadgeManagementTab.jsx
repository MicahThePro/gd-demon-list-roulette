import { useEffect, useState } from 'react'
import {
  createAccountBadge,
  deleteAccountBadge,
  fetchAccountBadges,
  searchAccounts,
  updateAccountBadge,
} from '../services/adminService'
import { getBadgeTextColor } from '../utils/profileBadges'

const DEFAULT_COLOR = '#3b82f6'

export default function BadgeManagementTab({ passcode }) {
  const [query, setQuery] = useState('')
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [badges, setBadges] = useState([])
  const [text, setText] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [editingId, setEditingId] = useState(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingBadges, setIsLoadingBadges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const handle = setTimeout(() => {
      setIsSearching(true)
      setError('')
      searchAccounts(passcode, query, controller.signal)
        .then(setAccounts)
        .catch((caught) => {
          if (caught?.name !== 'AbortError') setError(caught?.message ?? 'Could not search accounts.')
        })
        .finally(() => setIsSearching(false))
    }, query ? 200 : 0)

    return () => {
      clearTimeout(handle)
      controller.abort()
    }
  }, [passcode, query])

  useEffect(() => {
    if (!selectedAccount) {
      return undefined
    }

    const controller = new AbortController()
    fetchAccountBadges(passcode, selectedAccount.id, controller.signal)
      .then(setBadges)
      .catch((caught) => {
        if (caught?.name !== 'AbortError') setError(caught?.message ?? 'Could not load profile badges.')
      })
      .finally(() => setIsLoadingBadges(false))

    return () => controller.abort()
  }, [passcode, selectedAccount, revision])

  const resetForm = () => {
    setText('')
    setColor(DEFAULT_COLOR)
    setEditingId(null)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!selectedAccount || isSaving) return

    setIsSaving(true)
    setError('')
    try {
      const badge = { text, color }
      if (editingId === null) {
        await createAccountBadge(passcode, selectedAccount.id, badge)
      } else {
        await updateAccountBadge(passcode, selectedAccount.id, editingId, badge)
      }
      resetForm()
      setIsLoadingBadges(true)
      setRevision((value) => value + 1)
    } catch (caught) {
      setError(caught?.message ?? 'Could not save the badge.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (badge) => {
    if (!selectedAccount || badge.isProtected || isSaving) return
    if (!window.confirm(`Remove the ${badge.text} badge from @${selectedAccount.username}?`)) return

    setIsSaving(true)
    setError('')
    try {
      await deleteAccountBadge(passcode, selectedAccount.id, badge.id)
      if (editingId === badge.id) resetForm()
      setIsLoadingBadges(true)
      setRevision((value) => value + 1)
    } catch (caught) {
      setError(caught?.message ?? 'Could not remove the badge.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="admin-badges">
      <div className="admin-badge-search">
        <label className="admin-search">
          Search users
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Username or display name"
            autoComplete="off"
          />
        </label>

        {error && <div className="validation-message">{error}</div>}
        {isSearching && accounts.length === 0 ? (
          <p className="global-board-message">Searching...</p>
        ) : accounts.length === 0 ? (
          <p className="global-board-message">{query ? `No user matches "${query}".` : 'No users yet.'}</p>
        ) : (
          <div className="admin-account-list">
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                className={
                  selectedAccount?.id === account.id
                    ? 'admin-account-row admin-account-row-active'
                    : 'admin-account-row'
                }
                onClick={() => {
                  resetForm()
                  setSelectedAccount(account)
                  setIsLoadingBadges(true)
                  setError('')
                }}
              >
                <strong>{account.displayName || account.username}</strong>
                <span className="admin-account-username">@{account.username}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <section className="admin-badge-detail" aria-label="Selected profile badges">
        {!selectedAccount ? (
          <p className="global-board-message">Choose a user to manage their profile badges.</p>
        ) : (
          <>
            <div className="admin-detail-head">
              <div>
                <strong>{selectedAccount.displayName || selectedAccount.username}</strong>
                <span>@{selectedAccount.username}</span>
              </div>
              <button
                type="button"
                className="lb-back"
                onClick={() => {
                  setSelectedAccount(null)
                  setIsLoadingBadges(false)
                }}
              >
                &larr; Users
              </button>
            </div>

            {isLoadingBadges ? (
              <p className="global-board-message">Loading badges...</p>
            ) : (
              <>
                <div className="profile-badges" aria-label="Current profile badges">
                  {badges.map((badge) => (
                    <div className="admin-badge-item" key={badge.id ?? 'owner'}>
                      <span
                        className="profile-badge"
                        style={{ backgroundColor: badge.color, color: getBadgeTextColor(badge.color) }}
                      >
                        {badge.text}
                      </span>
                      {badge.isProtected ? (
                        <small>Permanent</small>
                      ) : (
                        <div className="action-row">
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={isSaving}
                            onClick={() => {
                              setEditingId(badge.id)
                              setText(badge.text)
                              setColor(badge.color)
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={isSaving}
                            onClick={() => handleDelete(badge)}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {badges.length === 0 && <p className="settings-hint">This profile has no badges yet.</p>}
                </div>

                <form className="admin-badge-form" onSubmit={handleSubmit}>
                  <h3>{editingId === null ? 'Assign a badge' : 'Edit badge'}</h3>
                  <label>
                    Badge text
                    <input
                      type="text"
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                      maxLength={32}
                      required
                    />
                  </label>
                  <label className="admin-badge-color-field">
                    Badge color
                    <input
                      type="color"
                      value={color}
                      onChange={(event) => setColor(event.target.value)}
                    />
                    <span>{color.toUpperCase()}</span>
                  </label>
                  <span
                    className="profile-badge admin-badge-preview"
                    style={{ backgroundColor: color, color: getBadgeTextColor(color) }}
                  >
                    {text.trim() || 'Badge preview'}
                  </span>
                  <div className="action-row">
                    <button type="submit" className="primary-button" disabled={isSaving}>
                      {isSaving ? 'Saving...' : editingId === null ? 'Assign badge' : 'Save changes'}
                    </button>
                    {editingId !== null && (
                      <button type="button" className="secondary-button" onClick={resetForm} disabled={isSaving}>
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </>
            )}
          </>
        )}
      </section>
    </div>
  )
}
