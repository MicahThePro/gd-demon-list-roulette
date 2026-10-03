# GD List Roulette — Full Project Explanation

## 1. What this website is

This is a browser game and community platform built around Geometry Dash challenge runs. The core idea is that instead of choosing your own level order, the app randomly selects levels from a curated list and turns them into a roulette-style challenge run.

A player starts a run, the game picks a level from a configured list, and the target percentage is set according to the challenge rules. The player then attempts that level. If they clear the level, the challenge continues with a new target and another level. If they fail, time out, skip, or otherwise end the run, the run is finished and the result is stored.

On top of that core game loop, this project adds:

- account login and persistent player identity
- public profiles and follow relationships
- notifications and social activity
- run history tied to a user account
- leaderboards for submitted runs
- moderation and admin tools
- versioned archived builds of older app releases
- Cloudflare Worker-powered backend and database access

In plain English: this is not just a random level picker. It is a full challenge platform that feels like a game, a social site, and a leaderboard-driven community tool all at once.

---

## 2. The main gameplay concept

The central mechanic is a list roulette challenge.

A standard run works like this:

1. The player selects a source list.
2. The player chooses a step size, such as 1%, 5%, or 10%.
3. The app chooses a random level from that list.
4. The run sets the target percentage for that level.
5. The player attempts the selected level.
6. If the player clears the level, the next target is set and a new level is picked.
7. If the player fails, gives up, times out, or otherwise ends the run, the run is marked complete.
8. If the player reaches 100%, they win the run.

This creates a challenge format that is both structured and unpredictable. The list provides the content, and the roulette system provides the surprise. That makes every run feel different from the last even when the player is using the same list and settings.

Because the project is built for repeated play, it also supports persistent run state, history, save codes, and social comparisons between players.

---

## 3. What the player can actually do

### 3.1 Play a roulette run

The main user flow is the run itself. A player can:

- choose a challenge list
- set or adjust challenge rules
- enable or disable skipping
- change target step size
- choose a level selection source
- pass through the roulette loop and complete levels one by one

The app calculates run performance using elapsed time, levels passed, skipped levels, totals, and target progression. The run state is fully tracked so it can be summarized after completion.

### 3.2 Save and restore a run

This project treats a run like a real game state, not just a one-off score. A player can save a run into a code string and restore it later. This is especially useful for long sessions, mobile play, communication between devices, or returning to a run after a break.

This works by serializing run state, including the current target progress, level state, and timing information.

### 3.3 View personal run history

Every signed-in account stores its runs. That means players can later view a timeline of their previous attempts, including:

- score information
- level source
- percentage step
- clear status
- play time
- created date
- whether the run is still on the public board

This gives the app a personal progression system instead of just a temporary challenge session.

### 3.4 Submit to the global leaderboard

The project supports public run submission. A player can submit a completed run if it meets the rules and includes a recording or proof. Once approved by the system and/or moderators, the run can become part of the public leaderboard rankings.

This means a challenge run is not just personal history. It can become a public performance metric.

### 3.5 View profiles and community pages

Players can browse profiles and user pages, showing:

- display name
- username handle
- follower count
- following count
- public accepted runs
- join date
- public contribution activity

This turns the app into a social platform that sits on top of the challenge system rather than being just a solo game.

### 3.6 Follow people and get notifications

The app supports social connectivity:

- follow a player
- unfollow a player
- view who a player follows
- view who follows that player
- get notifications when social events happen
- mark notifications as read

This is a real social layer built into the app. It makes profiles more than isolated pages and helps turn the platform into a small community.

---

## 4. The levels and sources

A major part of the website is the data source behind the challenge lists. The app works with a variety of community list sources instead of one single pool of levels.

### 4.1 Pointercrate

Pointercrate is one of the main source types. A run may originate from Pointercrate and can be filtered by list parts or list subsets. The app stores which Pointercrate lists a run came from so that a run can be represented correctly later.

### 4.2 Challenge List

The Challenge List is another source and is hydrated with extra metadata when needed. This can include thumbnails, links, challenge page data, and specific identifiers for the listed level when the source does not include them.

### 4.3 Impossible Levels List

The Impossible Levels list carries level metadata that is not always fully available in the raw list responses. The app fetches rate information and version data on demand for the current challenge level so the UI can display the needed details without doing a giant fetch for the whole list.

### 4.4 AREDL

AREDL levels can be hydrated with creator and image data so the app can show a better player-facing card. Some source data is sparse, so the frontend and backend hydrate missing details before the current level is displayed.

### 4.5 Mixed list support

The app is explicitly designed to support multiple list sources and different kinds of measurements. That means the same run structure can hold different list metadata depending on which list the level comes from, while still using the same challenge flow and run engine.

---

## 5. Challenge rules and settings system

The project has a fairly deep rule engine that governs how a run behaves.

### 5.1 Percentage step

The step size is one of the most important rules in the game. A smaller step means a longer run with more levels and more gradual progression. A larger step means less time per run and a more compressed challenge.

This is not just visual; it directly affects the progression of the challenge and the target percentages the player has to hit.

### 5.2 Skip support

Skipping is a configurable feature. Skip behaviour may be disabled to keep the challenge strict, or enabled so players can pass on a level with a reason. If a level is skipped, the run records the skip reason and keeps a log of what happened.

### 5.3 Timed rounds and overall timers

The app tracks:

- time spent on a specific level
- total run time
- whether the round timed out
- whether the player gave up
- whether the run ended due to a failed challenge

This data is important because many challenge runs are judged on both their clear rate and the speed of completion.

### 5.4 Difficulty and target logic

Every successful level advances the target. The app calculates the next target percentage and chooses another level until the run ends or the player reaches 100%. The system is designed so the target logic is deterministic and consistent across the app.

### 5.5 Player rule preferences

Many settings are stored in cookies or persistent browser state so players do not need to reconfigure the app every time they visit. This makes the site feel more like a real game client instead of a static page with random values.

---

## 6. Accounts and identity system

The app uses a user system backed by a backend and database.

### 6.1 Username and display name split

The project intentionally separates:

- username: the permanent account identifier used for login and backend matching
- display name: the publicly shown label on pages and leaderboards

This matters because a player may want a readable name while still keeping a technical or platform-specific username for login. The app also supports unique username rules and display name capitalization behavior.

### 6.2 Session authentication

Players sign in using a username and password. The backend creates a session token and stores it. This token is used whenever the app talks to protected endpoints such as run submission, account settings, notification fetching, and social actions.

### 6.3 Display name editing

The app includes a display name change flow with a cooldown. That means players cannot change their display name freely at any time. The server enforces a cooldown window, and the client reflects the remaining time.

### 6.4 Security and moderation protections

The account system blocks unauthorized actions and validates run input. A player cannot simply re-submit a run under a different identity or alter leaderboard data from the client. The backend enforces the rules and the app trusts the server rather than raw browser state.

---

## 7. Leaderboards and competition

This website is also a competitive leaderboard platform.

### 7.1 Global board

The app exposes a main leaderboard of accepted runs. The board is sorted by game rules and can be filtered by:

- list source
- list type
- specific parts or subsets
- board variants

This makes it possible to compare runs by the same challenge structure rather than just by one giant combined list.

### 7.2 Personal standing

A signed-in player can see where they stand in a board or context-specific ranking. This is useful because the app supports not just global rank but also personal progression when the player is signed in.

### 7.3 Public run records

A player’s accepted runs are stored and displayed in their profile and public profile summaries. This makes the site feel like a shared challenge tracker rather than a purely ephemeral game session.

### 7.4 Ranking logic

The leaderboard uses score, cleared levels, and run ordering logic to determine rank position. It does not just use raw completion count; it uses the rules of the challenge system. That is why the backend and leaderboard calculations are a serious part of the app instead of a cosmetic page.

---

## 8. Social and profile system

This is one of the more substantial features of the project. It turns the app from a simple game into a small social network around challenge runs.

### 8.1 User search

Users can search for other players by username or partial match. Search results are paginated and include identity info and follower counts.

### 8.2 User cards

Profile search results are displayed as cards with:

- display name
- username
- follower count
- a click target to open the profile

This is the first social interaction point inside the site.

### 8.3 Follow and unfollow

Players can follow and unfollow others. The app updates the state so the button changes based on whether the viewer is already following them. This is backed by server-side relationship tables and not just client-side memory.

### 8.4 Follower and following totals

The profile page shows counts for:

- followers
- following
- accepted runs
- join date

This adds important accountability to the social system and makes profile pages feel more complete.

### 8.5 notifications

There is a notifications system for one-to-one social events. Users can:

- see their notifications
- see unread counts
- open notifications
- mark them as read

This keeps activity visible even when a player is not actively browsing the site.

### 8.6 Profile run cards

The profile screen displays a player’s accepted public runs in a compact list or paged card layout. This lets the profile include challenge history without overwhelming the user with a giant running list.

---

## 9. Moderation and admin tools

This website includes a backend and admin layer for operational control.

### 9.1 Run moderation

Runs can be approved, trashed, reviewed, or deleted depending on their state. This is important because public leaderboards need to stay trustworthy. A run should not appear in public rankings without validation.

### 9.2 User/account cleanup

The backend handles account operations and related data cleanup. This includes cleaning up follow relationships and notification data when an account is deleted or otherwise invalidated.

### 9.3 Bans and lockouts

There is logic for banning suspicious or abusive clients, rate limits, and lockout detection. This is a real service layer, not a toy site. The backend can ban IP-based addresses or blocked clients if needed.

### 9.4 Admin panel

The repo has an admin entry point and dedicated admin tooling. This is used for moderation, backend operations, and system oversight. The site’s admin layer is a serious complement to the user-facing app.

---

## 10. Data flow and architecture

This project is split between a frontend app and a backend service.

### 10.1 Frontend

The frontend is a React app built with Vite. It handles:

- UI rendering
- game state
- account UI
- leaderboard display
- profile and social views
- run history and screen transitions

The frontend does not own the system of truth for accounts, runs, leaderboards, or follow data. It asks the backend for those things and renders the answer.

### 10.2 Worker backend

The Cloudflare Worker provides the API. It is responsible for:

- user registration and login
- session validation
- challenge leaderboard queries
- user search
- follows and notifications
- run submission and validation
- admin routes
- D1 database interaction

This is a classic app architecture: the static frontend shows the experience, while the backend enforces rules and stores the shared data.

### 10.3 D1 database

The database stores:

- accounts and session state
- runs and run rounds
- leaderboard-related records
- follow relationships
- notification records
- social relationship state

This makes persistence reliable and makes account identity and public data consistent across sessions.

### 10.4 Static hosting

The site is built for GitHub Pages static hosting and also produces versioned static builds for archived releases. That gives the project a strong release story and keeps older versions available without requiring a server per version.

---

## 11. The versioned build system

The project includes a versioning and archive system.

### 11.1 Current app version

The app includes a changelog and version metadata. This supports explanation of what changed between versions, what new features shipped, and which changes were live at a given time.

### 11.2 Archived versions

The project keeps multiple older versions in a versions directory. These are static snapshots of the site at earlier times. This is useful because the app is evolving and many players may want to revisit the old build or compare older interfaces.

### 11.3 Blocked online versions

The project includes scripts to block online access for certain versions, which is useful when a version is outdated or should no longer be used as the live experience.

---

## 12. How the app feels to a user

The experience is a combination of a challenge game and a community website.

A user starts by:

- signing in or creating an account
- selecting a list and challenge settings
- playing a run
- submitting to the leaderboard or preserving the run in history
- visiting profiles and checking social content
- following other players
- checking notifications
- reviewing accepted public runs and leaderboard standing

That is why the site feels much larger than a normal randomizer: it is an ecosystem for challenge runs and community competition.

---

## 13. What makes this project different from a basic randomizer

A basic level randomizer only picks a level. This project adds:

- persistent user accounts
- challenge tracking and run history
- social features
- moderation and admin control
- leaderboard submission
- rules enforcement on the backend
- list and metadata sourcing from multiple communities
- archival and versioning support
- a backend that protects and stores data reliably

It is much closer to a game platform than a single-page toy. The randomizer is the front door, but the rest of the project is what makes it feel complete.

---

## 14. Development and deployment workflow

The project is built for modern frontend + worker deployment workflows.

### 14.1 Development

Local development uses Vite for the frontend and Wrangler for the worker. That means the game can be tested both visually and through API-backed logic.

### 14.2 Database migrations

The worker uses D1 database migrations. These are applied with Wrangler commands to keep the production database schema in sync with the code.

### 14.3 Frontend deployment

The frontend is built through Vite and then published with GitHub Pages using gh-pages. This means the live site uses static hosting while the backend still lives in Cloudflare.

### 14.4 Worker deployment

The Worker is deployed to Cloudflare directly. It handles all the API calls, authentication flows, and application rules. This splits the responsibilities cleanly: static frontend for interface, Cloudflare Worker for dynamic backend logic.

---

## 15. Example user journey

A typical player flows through the site like this:

1. Opens the site.
2. Signs up or logs in.
3. Chooses a list and challenge settings.
4. Starts a run.
5. Attempts the selected level and keeps advancing.
6. Saves or finishes the run.
7. Sees the result summary.
8. Submits the run if desired.
9. Visits their profile to check accepted runs.
10. Follows other players or sees their social activity.
11. Reads notifications and compares leaderboard placement.

This gives the site a complete lifecycle: challenge play, account tracking, competition, and community interaction.

---

## 16. Why this website matters

This project sits at the intersection of several things:

- a challenge format inspired by Geometry Dash list runs
- a game loop with randomization and progression
- a persistent account system
- a public leaderboard and player profile structure
- an online community layer
- a backend architecture built for data integrity and security

The site is not just a list of levels. It is a challenge platform that turns a simple random roulette concept into a deeper experience with social, competitive, and persistent elements.

---

## 17. Summary

In one sentence: GD List Roulette is a Geometry Dash challenge game that randomizes levels from curated lists, tracks player progress with accounts, exposes public profiles and leaderboard data, and supports social features and moderation through a modern frontend-plus-worker architecture.

It is built for people who want more than a random level picker. It gives them a full challenge system with persistence, leaderboards, community, and long-term progression.

---

## 18. Project structure at a glance

The project is organized into a few main areas:

- frontend React app in the src folder
- static app pages and custom styling in App.jsx and App.css
- worker logic in worker/
- list and data-building scripts in scripts/
- archived versions in versions/
- public deployment assets under public/
- configuration files such as package.json and wrangler.jsonc

The app is intentionally split so that the UI can stay fast while the backend enforces challenge rules and stores all the important state.

---

## 19. Final takeaway

This website is best understood as a full challenge platform disguised as a randomizer. The random level system is the visible hook, but the real value of the project is in everything around it:

- user accounts
- leaderboard submission
- persistent run records
- public social profiles
- cross-device challenge continuity
- moderation and server-side validation
- a curated list ecosystem
- old-version support and release management

That is why this project is much more than a simple page with a list of levels. It is a complete community-driven challenge app.
