# Friends / Follow System Specification

This is the full product specification for the follow-only social system you want in GD List Roulette.

## Product goals

- Let users search for other users by username only
- Let users view public profile pages
- Let users follow other players
- Notify users when somebody follows them
- Let users click a notification to visit the follower’s profile
- Show a user’s accepted leaderboard runs only
- Show the same list filters that the leaderboard already uses
- Show follower and following counts
- Default the empty search box to @geometricalmike

## Core rules

1. Follow-only, not friend requests
2. Profiles are always public
3. Profiles only show accepted leaderboard runs
4. Search is username-only
5. Empty search opens your profile by default
6. Notifications appear on a dedicated page
7. Notification tap opens the user’s profile

---

## User-facing behavior

### Search bar

- Search box is labeled “Search users”
- It searches by username only
- Matching is case-insensitive
- Matching uses username starts-with first
- Example: typing `@geo` should match `@geometricalmike`
- Example: `geometricalmike` should match `@geometricalmike`
- If the search field is clicked and left empty, it loads the profile for `@geometricalmike`
- This is the default profile shortcut for your own account

### Profile page

A profile includes:
- username
- display name
- follower count
- following count
- button to follow/unfollow
- count of accepted public runs
- section with the user’s global accepted runs

A profile must never show:
- rejected runs
- pending runs
- local-only runs
- private runs

### Follow button

- When you are on another user’s profile and are not already following them, the button says `Follow`
- When already following, it says `Following`
- Clicking it immediately creates the follow relationship
- The followed user gets a notification
- The button updates live after the action

### Notification page

The notification button in the header opens a page like `/notifications`.

Each notification item includes:
- the name of the person who followed you
- a username tag
- a profile link to that user
- timestamp
- unread/read state

Example notification:
- `@player123 followed you`
- Clicking it opens `@player123`’s profile

### Runs on profile

The runs section behaves like the existing leaderboard view:
- All lists
- Main list only
- Legacy list only
- Pointercrate list filters
- any other existing leaderboard filters already in your app

Only runs that were:
- submitted
- accepted
- stored on the global leaderboard
- associated with that user

should appear.

---

## Data model

### users

Fields:
- id
- username
- display_name
- created_at
- updated_at

Notes:
- username is unique and lowercased
- display_name is public label shown on profile/leaderboard
- profiles are always public

### follows

Fields:
- id
- follower_user_id
- following_user_id
- created_at

Rules:
- `follower_user_id` is the user who is following
- `following_user_id` is the user being followed
- one follow record per user pair
- no private/friend request state in the MVP

### notifications

Fields:
- id
- user_id
- actor_user_id
- type
- is_read
- created_at
- metadata

Supported notification type in MVP:
- `follow`

Example metadata could be:
- `{ "username": "player123" }`

### runs

This should use the existing runs/submission system already in the app.

Needed filtering fields:
- user_id
- status
- source
- created_at
- accepted_on_leaderboard
- public

Minimum rule for profile visibility:
- only runs where `accepted_on_leaderboard = true` and `public = true`

---

## API endpoints

### Search users

`GET /api/users/search?q=...`

Response:
- matching username list
- each result includes:
  - id
  - username
  - displayName
  - followerCount
  - followingCount

Example result:

```json
{
  "users": [
    {
      "id": 42,
      "username": "geometricalmike",
      "displayName": "Mike",
      "followerCount": 91,
      "followingCount": 37
    }
  ]
}
```

### User profile

`GET /api/users/:username`

Response:
- user summary
- follower count
- following count
- accepted run count
- `isFollowing` if the signed-in user is following them
- `canFollow` if the current viewer is allowed to follow

### Follow user

`POST /api/users/:username/follow`

Response:
- success
- updated follower/following counts
- follow status

### Unfollow user

`POST /api/users/:username/unfollow`

Response:
- success
- updated follower/following counts

### Notifications list

`GET /api/notifications`

Response:
- list of notifications for the signed-in user
- unread count
- notification objects with user, metadata, timestamp

### Mark notification read

`POST /api/notifications/:id/read`

### Notification count

`GET /api/notifications/count`

---

## Profile route / page behavior

### Route format

Examples:
- `/profile/@geometricalmike`
- `/profile/geometricalmike`
- `/user/geometricalmike`

Best route for your app:
- `/profile/:username`

### Behavior

When visiting a profile:
- fetch the user by username
- fetch their accepted public runs
- fetch follower and following counts
- render follow button based on current auth state

If the viewer is signed in and visiting their own profile:
- follow button hides or changes to `Your profile`
- no follow action against yourself

---

## Empty-search default behavior

This should be built exactly as specified:

- clicking the search box without typing should set the search field to `@geometricalmike`
- pressing Enter or clicking search opens your profile immediately
- if you are not signed in, it still opens `@geometricalmike` as a public profile

This means:
- users can immediately inspect the main profile without typing
- the app has a direct personal-profile shortcut
- your own account is always reachable with one click

---

## Notification flow

1. User A follows User B
2. Worker creates follow relationship
3. Worker creates notification for User B
4. User B sees notification badge in the header
5. User B opens notification page
6. Notification says `@A followed you`
7. Clicking it navigates to User A’s profile

Notifications are not sent to the follower; only the followed user receives them.

---

## Accepted public runs only

Profile runs must be computed from the leaderboard-side run metadata.

A run is valid for a profile if:
- `user_id` matches target user
- `leaderboard_status = accepted` or equivalent accepted state
- `public = true`
- not hidden
- not deleted

This prevents profile pages from showing:
- queued or rejected runs
- local-only incomplete runs
- tests or drafts

---

## Suggested UI layout

### Header
- search box
- notification bell with unread count
- profile button

### Profile hero card
- username line
- display name
- follower count
- following count
- accepted run count
- follow button

### Runs panel
- same filter row as the leaderboard
- list of accepted runs
- each run card shows:
  - result %
  - list source
  - date
  - maybe score / clear summary

### Notifications page
- heading: `Notifications`
- list of rows
- each row is clickable
- each row says who followed you and offers profile access

---

## Required implementation steps

### Phase 1: database

Add tables:
- follows
- notifications
- optionally indexes for username search and follow lookups

### Phase 2: backend routes

Implement:
- user search
- profile fetch
- follow/unfollow
- notifications list
- unread count
- mark read

### Phase 3: frontend

Add:
- notification button in header
- notifications page
- profile page
- search box logic
- follow button logic
- profile run filtering

### Phase 4: polish

- unread badge animation
- profile tabs if needed
- follower/following page routes
- default search shortcut for @geometricalmike

---

## Acceptance criteria

### Search
- User can type a username and find a user
- Search is case-insensitive
- Search is username-only
- Empty search opens @geometricalmike

### Follow
- User can follow someone
- Follower count updates immediately
- Following count updates immediately
- The followed user receives a notification

### Notifications
- Notification appears in the notifications page
- Notification is clickable
- Clicking opens the profile page of the user who followed them

### Profile
- Profile shows public accepted leaderboard runs only
- Same list filters as global leaderboard appear
- Follower and following counts appear
- Runs are filtered correctly based on the selected list

---

## Recommended MVP scope

This is the exact MVP I recommend:

- follow-only
- public profiles only
- username-only search
- notifications page
- profile page with accepted public runs
- list filters inherited from leaderboard
- empty search default to @geometricalmike

This is the clean version of the feature that fits the current app without overengineering it.

---

## Final product definition

The social feature is not a full social media app. It is a clean player identity layer built on top of your existing leaderboard and account system.

It adds:
- identity
- follow relationships
- public profile visibility
- public run history
- notifications

That gives the app a real community feel without making it a large social platform all at once.
