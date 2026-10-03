import { useEffect, useMemo, useState } from 'react'
import { fetchUserProfile, followUser, searchUsers, unfollowUser } from '../services/apiService'
import { censorText } from '../utils/censor'
import { getBadgeTextColor } from '../utils/profileBadges'

const PAGE_SIZE = 12

const formatWhen = (value) => {
  if (!value) return 'Recently'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Recently' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const sortRuns = (runs = []) => [...runs].sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0))

export default function ProfilePage({ username, viewer, relationshipVersion, onRelationshipChange, onOpenProfile, onBack }) {
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState(username || 'geometricalmike')
  const [searchResults, setSearchResults] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalUsers, setTotalUsers] = useState(0)
  const [runPage, setRunPage] = useState(1)
  const RUNS_PER_PAGE = 5

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
  }, [username, relationshipVersion])

  const sortedRuns = useMemo(() => sortRuns(profile?.runs ?? []), [profile])
  const totalRunPages = Math.max(1, Math.ceil(sortedRuns.length / RUNS_PER_PAGE))
  const visibleRuns = sortedRuns.slice((runPage - 1) * RUNS_PER_PAGE, runPage * RUNS_PER_PAGE)

  useEffect(() => {
    setRunPage(1)
  }, [username])

  const onFollowToggle = async () => {
    if (!profile?.user?.username || busy) return
    setBusy(true)
    try {
      const result = await (profile.user.isFollowing ? unfollowUser(profile.user.username) : followUser(profile.user.username))
      const nextUser = {
        ...(profile.user ?? {}),
        ...(result.user?.user ?? {}),
        isFollowing: Boolean(result.following),
      }

      setProfile((current) => ({
        ...current,
        user: nextUser,
      }))

      setSearchResults((current) =>
        current.map((user) =>
          user.username === nextUser.username
            ? {
                ...user,
                followerCount: Number(nextUser.followerCount ?? user.followerCount ?? 0),
                followingCount: Number(nextUser.followingCount ?? user.followingCount ?? 0),
              }
            : user,
        ),
      )

      onRelationshipChange?.()
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
                {profile.user.badges?.length > 0 && (
                  <div className="profile-badges" aria-label="Profile badges">
                    {profile.user.badges.map((badge) => (
                      <span
                        className="profile-badge"
                        key={badge.id ?? `${badge.text}-${badge.color}`}
                        style={{ backgroundColor: badge.color, color: getBadgeTextColor(badge.color) }}
                      >
                        {badge.text}
                      </span>
                    ))}
                  </div>
                )}
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
                <div className="profile-run-panel">
                  {totalRunPages > 1 && (
                    <div className="profile-run-nav" aria-label="Run pages">
                      <button
                        type="button"
                        className="page-button"
                        onClick={() => setRunPage((current) => Math.max(1, current - 1))}
                        disabled={runPage === 1}
                      >
                        ←
                      </button>
                      <span>{runPage} / {totalRunPages}</span>
                      <button
                        type="button"
                        className="page-button"
                        onClick={() => setRunPage((current) => Math.min(totalRunPages, current + 1))}
                        disabled={runPage === totalRunPages}
                      >
                        →
                      </button>
                    </div>
                  )}

                  <div className="profile-run-slider">
                    {visibleRuns.map((entry, index) => {
                      const runNumber = (runPage - 1) * RUNS_PER_PAGE + index + 1

                      return (
                        <div key={entry.id} className="profile-run-card">
                          <div className="profile-run-score">{entry.score}%</div>
                          <div className="profile-run-source">{censorText(entry.source)}</div>
                          <div className="profile-run-meta">
                            {entry.passed} cleared · {entry.roundsPlayed} played
                          </div>
                          <div className="profile-run-number">#{runNumber}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
