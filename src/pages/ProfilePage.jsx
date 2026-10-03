import { useEffect, useMemo, useState } from 'react'
import { fetchUserProfile, followUser, unfollowUser } from '../services/apiService'

const formatWhen = (value) => {
  if (!value) return 'Recently'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Recently' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const sortRuns = (runs = []) => [...runs].sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0))

export default function ProfilePage({ username, viewer, onOpenProfile, onBack }) {
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState(username || 'geometricalmike')

  useEffect(() => {
    setQuery(username || 'geometricalmike')
  }, [username])

  const loadProfile = async (nextUsername = query) => {
    try {
      setError('')
      const result = await fetchUserProfile(nextUsername || 'geometricalmike')
      setProfile(result)
    } catch (caught) {
      setError(caught?.message ?? 'That profile could not be loaded.')
      setProfile(null)
    }
  }

  useEffect(() => {
    loadProfile(username || 'geometricalmike')
  }, [username])

  const sortedRuns = useMemo(() => sortRuns(profile?.runs ?? []), [profile])

  const onFollowToggle = async () => {
    if (!profile?.user?.username || busy) return
    setBusy(true)
    try {
      const result = await (profile.user.isFollowing ? unfollowUser(profile.user.username) : followUser(profile.user.username))
      setProfile((current) => ({
        ...current,
        user: {
          ...(current?.user ?? {}),
          ...result.user?.user,
          isFollowing: Boolean(result.following),
        },
      }))
    } catch (caught) {
      setError(caught?.message ?? 'Could not update that relationship.')
    } finally {
      setBusy(false)
    }
  }

  const handleSearch = async (event) => {
    event.preventDefault()
    const next = query.trim() || 'geometricalmike'
    await loadProfile(next)
    onOpenProfile?.(next)
  }

  return (
    <main className="page-shell">
      <section className="panel hero-panel hero-panel-wide">
        <header className="board-page-bar">
          <div>
            <p className="eyebrow">Community</p>
            <h2>Profiles</h2>
          </div>
          <button type="button" className="secondary-button" onClick={onBack}>
            Back home
          </button>
        </header>

        <form className="setup-form" onSubmit={handleSearch}>
          <label>
            Search users
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onBlur={() => {
                const next = query.trim() || 'geometricalmike'
                if (next !== query) setQuery(next)
              }}
              placeholder="@geometricalmike"
            />
          </label>
          <div className="action-row">
            <button type="submit" className="primary-button">View profile</button>
          </div>
        </form>

        {error && <div className="validation-message">{error}</div>}

        {profile?.user && (
          <div className="profile-card">
            <div className="profile-header">
              <div>
                <p className="eyebrow">Player</p>
                <h3>{profile.user.displayName || profile.user.username}</h3>
                <p className="account-handle">@{profile.user.username}</p>
              </div>
              {viewer && viewer.username !== profile.user.username && (
                <button type="button" className="primary-button" onClick={onFollowToggle} disabled={busy}>
                  {profile.user.isFollowing ? 'Following' : 'Follow'}
                </button>
              )}
            </div>

            <div className="profile-summary">
              <div><strong>{profile.user.followerCount}</strong><span>Followers</span></div>
              <div><strong>{profile.user.followingCount}</strong><span>Following</span></div>
              <div><strong>{sortedRuns.length}</strong><span>Accepted runs</span></div>
              <div><strong>{formatWhen(profile.user.createdAt)}</strong><span>Joined</span></div>
            </div>

            <div className="leaderboard">
              <div className="lb-tabs">
                <span className="lb-filter lb-filter-active">Accepted global runs</span>
              </div>
              {sortedRuns.length === 0 ? (
                <p className="lb-empty">This player has no accepted public runs yet.</p>
              ) : (
                <div className="lb-list">
                  {sortedRuns.map((entry) => (
                    <div key={entry.id} className="lb-row">
                      <span className="lb-rank">#{entry.rank ?? '-'}</span>
                      <span className="lb-main">
                        <span className="lb-top">
                          <strong>{entry.score}%</strong>
                          <span className="lb-handle">{entry.source}</span>
                        </span>
                        <span className="lb-sub">
                          {entry.passed} cleared · {entry.roundsPlayed} played · {formatWhen(entry.createdAt)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
