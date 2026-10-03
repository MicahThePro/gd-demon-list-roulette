import { useEffect, useMemo, useState } from 'react'
import { fetchUserProfile, followUser, searchUsers, unfollowUser } from '../services/apiService'

const PAGE_SIZE = 12

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
  const [searchResults, setSearchResults] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalUsers, setTotalUsers] = useState(0)

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

  const loadSearch = async (nextQuery = query, nextPage = page) => {
    const trimmed = String(nextQuery ?? '').trim()
    const searchText = trimmed || 'geometricalmike'
    try {
      const result = await searchUsers(searchText, nextPage, PAGE_SIZE)
      setSearchResults(result.users ?? [])
      setTotalPages(Math.max(1, Number(result.totalPages ?? 1)))
      setTotalUsers(Number(result.total ?? 0))
    } catch (caught) {
      setSearchResults([])
      setTotalPages(1)
      setTotalUsers(0)
      setError(caught?.message ?? 'Could not search for that user.')
    }
  }

  useEffect(() => {
    if (!query || query.trim() === '') {
      setPage(1)
      loadSearch('geometricalmike', 1)
      return
    }

    loadSearch(query, page)
  }, [query, page])

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
    setPage(1)
    await loadProfile(next)
    onOpenProfile?.(next)
  }

  const handleUserCardClick = async (name) => {
    const next = String(name ?? '').trim() || 'geometricalmike'
    setQuery(next)
    setPage(1)
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
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
              onBlur={() => {
                const next = query.trim() || 'geometricalmike'
                if (next !== query) setQuery(next)
              }}
              placeholder="Type a letter or username"
            />
          </label>
          <div className="action-row">
            <button type="submit" className="primary-button">Open profile</button>
          </div>
        </form>

        {error && <div className="validation-message">{error}</div>}

        {searchResults.length > 0 && (
          <div className="user-results-wrap">
            <div className="user-grid">
              {searchResults.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className="user-card"
                  onClick={() => handleUserCardClick(user.username)}
                >
                  <span className="user-card-avatar">@</span>
                  <strong>{user.displayName || user.username}</strong>
                  <small>@{user.username}</small>
                  <span>{user.followerCount} followers</span>
                </button>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="pagination" aria-label="User search pages">
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((num) => (
                  <button
                    key={num}
                    type="button"
                    className={num === page ? 'page-button page-button-active' : 'page-button'}
                    onClick={() => setPage(num)}
                  >
                    {num}
                  </button>
                ))}
              </div>
            )}

            <p className="settings-note">{totalUsers} matching users · page {page} of {totalPages}</p>
          </div>
        )}

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
