<div align="center">

# GD List Roulette

**Geometry Dash challenge roulette, expanded into a community platform.**

[**Play it live**](https://micahthepro.github.io/gd-list-roulette/) · [**Report an issue**](https://github.com/MicahThePro/gd-list-roulette/issues)

</div>

---

GD List Roulette started as a challenge randomizer and evolved into a larger social challenge platform. At its core it is still a Geometry Dash list roulette: players start a run, the app picks levels from a list, and the player tries to clear the target percentage in sequence. But the project now also includes persistent accounts, public profiles, follows, notifications, leaderboard submissions, moderation tools, app version archives, and a Cloudflare-backed backend.

This README is intentionally much longer than the original because the project has become more than a single browser game. It is a full game + community system + moderation tooling + deployment pipeline. The goal here is to explain not just how to play, but what the whole project does, how the data flows, how the app is structured, and how to actually work on it and deploy it.

---

## Table of contents

- [Project overview](#project-overview)
- [What the project is](#what-the-project-is)
- [Why roulette works so well](#why-roulette-works-so-well)
- [Game loop and mechanics](#game-loop-and-mechanics)
- [Rules and challenge settings](#rules-and-challenge-settings)
- [Accounts and sessions](#accounts-and-sessions)
- [Public profiles and social system](#public-profiles-and-social-system)
- [Notifications and live state](#notifications-and-live-state)
- [Leaderboard and submissions](#leaderboard-and-submissions)
- [Admin moderation tools](#admin-moderation-tools)
- [Versioned builds and archived releases](#versioned-builds-and-archived-releases)
- [Architecture overview](#architecture-overview)
- [Key database tables](#key-database-tables)
- [Local development workflow](#local-development-workflow)
- [Deployment workflow](#deployment-workflow)
- [Project structure](#project-structure)
- [Testing and validation](#testing-and-validation)
- [Security and moderation protections](#security-and-moderation-protections)
- [Privacy and data handling](#privacy-and-data-handling)
- [Troubleshooting](#troubleshooting)
- [Tech stack](#tech-stack)
- [Contributing](#contributing)
- [Credit and sources](#credit-and-sources)
- [Short version](#short-version)

---

## Project overview

GD List Roulette is a browser-based challenge app for Geometry Dash players. Instead of picking a route manually, the player starts a roulette challenge and the app picks levels from a configured list. The objective is to reach the target percentage, clear the level, and continue through the list while surviving the whole run.

This project now goes much further than that. It includes:

- account-based gameplay persistence
- personal run history
- leaderboard submissions and approval workflow
- public profiles and social relationships
- follow/unfollow logic
- notification state and badge counts
- admin moderation tools
- archived version history
- Cloudflare worker-backed APIs and D1 storage

So the best way to think about the project is: it is a community challenge platform with a lot of game-loop logic sitting underneath it.

---

## What the project is

The project is built around the challenge format of Geometry Dash level roulette. The idea is simple on paper:

- choose a list
- choose a target step
- get a random level
- clear or fail it
- repeat until the run ends
- maybe reach 100% and complete the whole challenge

This is not just a random challenge generator. It is a full gameplay system with persistent state, social features, moderation, and leaderboard logic. The project can support a wide variety of challenge styles because the run is not fixed to a single set of rules.

Examples of supported list sources include:

- Pointercrate
- AREDL
- Global S****y List
- Challenge List
- Impossible Levels List
- additional runtime list filtering and source selection

The project is designed to feel replayable and flexible while still behaving like a serious challenge app rather than a random web toy.

---

## Why roulette works so well

The roulette mechanic is compelling because it keeps structure while creating uncertainty. Instead of choosing every battle manually, the player is forced to handle whatever the app throws at them.

This creates several advantages:

- more variety than a simple fixed progression run
- a stronger sense of accomplishment on a long run
- a more interesting challenge format for players who want to test themselves against random lists
- better comparison between players when runs are stored and ranked
- replayability without needing a huge amount of extra content

The step system matters a great deal. A small step such as 1% creates a much longer run than a larger step like 5% or 10%. The same app can therefore support calm long-form runs or high-intensity short runs depending on the configuration.

---

## Game loop and mechanics

The core gameplay flow is intentionally clean and consistent.

1. The player picks a list or subset.
2. They choose a run step size and other challenge settings.
3. A random level is selected from the active source list.
4. The run sets a target percentage for that level.
5. The player tries to reach that target.
6. If successful, the target advances and a new level is chosen.
7. If failed, skipped, or timed out, the run ends.
8. If the player reaches 100% and completes the route, the run is considered a successful roulette challenge.

The project tracks lots of run data beyond a simple pass/fail result:

- total score or evaluation result
- rounds played
- skipped levels
- time spent
- percent-step progress
- source list and filtering context
- leaderboards and accepted-submission state

These details are important because they make the run more reviewable and allow the app to support ranked challenge submissions rather than just a loose one-off run history.

Completed run records are saved to the signed-in player's account. Portable
in-progress run codes (including the old `GDLRS1:` format) are no longer
supported; use the account leaderboard to access saved runs across devices.

When an active run begins, the game reminds players who may submit it to start
recording before their first attempt. For a useful review, keep one continuous
video that clearly shows the Geometry Dash level, attempts and outcomes, and the
progress entered in the app; avoid cuts and keep the video available for review.

---

## Rules and challenge settings

The app supports several challenge rules and configuration values. These are not decorative; they define how the challenge feels.

### Step size

Step size is one of the biggest gameplay knobs. It determines how quickly the target percentage rises after a successful round.

Examples:

- 1% step: long, methodical, high-persistence runs
- 5% step: a shorter but still demanding challenge
- 10% step: compressed and brutal run style

### Skipping

Skipping can be toggled in the app. When enabled, a player can skip a round and record a reason. This is useful for challenge fairness and for understanding why a run ended.

### Timing rules

The app records and evaluates timing values such as:

- round duration
- run duration
- timeout behavior
- time-based failure cases

This matters because a run can fail for a real gameplay problem or simply because the timer expired. The app keeps those apart so the player can understand why the challenge ended.

### Rank filters

The project can narrow challenge sources by rank ranges, giving players a way to run a subset of a list rather than the entire thing. This makes the app more flexible and better suited to different player preferences.

### List source selection

The app can switch between multiple list ecosystems instead of forcing one fixed source. That makes the challenge feel more like a platform and less like a static single-list tool.

### Censoring and presentation controls

The app can hide or display profanity or offensive words in public name displays without deleting the underlying stored data. This is a nice balance between preserving data integrity and making the site feel safer and cleaner for public use.

---

## Accounts and sessions

This project is not only a local challenge app. It has a real account layer with sessions and persistent identity.

### Username and display name separation

The app separates these two concepts:

- username: account identity used for login, storage, session checks, and account matching
- display name: public-facing name shown in leaderboards and profile contexts

This gives the app a clearer identity model and keeps account uniqueness separate from how the player wants to appear publicly.

### Sessions and auth

Authentication is handled by the Cloudflare worker. A session token is stored on the client and sent with authenticated requests. The worker verifies that token before allowing sensitive actions such as:

- submitting runs
- viewing personal data
- following users
- updating profile-related state
- accessing admin endpoints

### Player data sync

The app supports a mirrored player data system that stores browser-side history and settings on the server. This is useful because a moderator can inspect what a player has synced without needing to access their actual browser directly.

### One-time login codes

The app includes support for temporary one-time login codes. These are useful for support/account workflows because they allow someone to access a user account in a safe, explicit, single-use way without exposing the real password.

---

## Public profiles and social system

A major addition to the app is the profile/social layer. This transformed the project from a challenge game into a broader community app.

### Public profiles

Users have public profile pages showing:

- username and display name
- follower and following counts
- accepted public runs
- run history and leaderboard entries
- profile counts and visible stats
- profile search and browsing

This makes the app more like a social platform than a single-player challenge script.

### Follow and unfollow

Users can follow and unfollow other users. The relationship is stored server-side and is used for counts, profile state, and notification generation.

### Username search

The profile search supports partial matching, not just exact matches. That makes discovery much smoother and makes the social layer feel more like a live community rather than a static profile list.

### Profile pagination

Run lists on profiles are paginated to keep long histories readable. This is essential when someone has many runs or lots of approved submissions.

### Social-state synchronization

The app refreshes social data from the backend instead of pretending it can trust purely local state. That matters because follow buttons, follower counts, and notification counts can otherwise become stale and confusing.

### Social cleanup on account deletion

When an account is deleted, the worker cleans up related relationships to prevent stale follow records or orphaned social data. This keeps the social graph consistent.

---

## Notifications and live state

The app also includes a notifications system.

### Notification feed

Users can access notifications for social activities such as:

- follows
- unfollows
- social account events
- account-related system notifications

### Unread badge tracking

The app tracks unread notifications and displays a badge count when there are new entries. This makes notifications feel like a real part of the app rather than a hidden background feature.

### Real-time refresh behavior

Notification counts and social state are refreshed from the backend as the user interacts with the app. This avoids stale states where the screen appears one way but the server has already changed.

### Follow toggles and immediate UI sync

The follow button changes based on the actual backend state. If a user follows someone, the button updates immediately and the counts refresh. That is important because otherwise the app would feel broken or inaccurate.

---

## Leaderboard and submissions

The leaderboard is one of the central competitive surfaces of the project.

### Approved runs only

Public leaderboard entries are only created from approved runs. Pending or rejected entries are not promoted to the board. This keeps the board cleaner and more honest.

### Submission review workflow

Players can submit a run by sending a video URL, container info, and note. Moderators then review the submission and decide whether to:

- approve
- reject
- delete

This creates a proper moderation cycle and keeps leaderboard entries reliable.

### Video verification

Video links are validated before submission is accepted. Unsafe schemes such as `javascript:`, `data:`, or `file:` are rejected. Most valid URLs are accepted, while suspicious or malformed ones are blocked.

### List filtering on leaderboard

The leaderboard supports filtered views such as:

- all lists
- main list only
- legacy list only
- source-specific filters

This makes the board more useful for both broad challenge viewing and more focused competitive views.

### Ranking and public stats

The app calculates public rank and performance values using approved run data and challenge metadata. These stats help players measure progress and compare themselves against the wider community.

---

## Admin moderation tools

The admin system is a serious part of the application and not just a hidden debug panel. Moderators can inspect and manage the data behind the game.

### Admin passcode flow

The worker protects admin routes behind a passcode. Wrong attempts are tracked, and repeated failures can trigger lockouts. This adds a basic but meaningful protection layer.

### Submission queue

The admin queue shows submissions grouped by status. Moderators can filter by pending, approved, rejected, or all entries and review each case in detail.

### Per-submission review details

Each moderated run includes detailed metadata such as:

- username and display name
- score and percent step
- rounds played and skipped counts
- time spent
- file size and format
- player note
- video URL and host
- review state

This is enough information for a moderator to judge the run fairly.

### Account inspection

Admins can search users, inspect profiles, view run histories, read mirrored data, revoke or issue login codes, and delete accounts if necessary.

### Run hiding and restoration

A run can be hidden from public views without fully deleting the underlying data. This is useful when an entry needs to be removed temporarily but should remain recoverable.

### Audit log

Moderator actions are recorded in an audit log so there is a paper trail of what happened. This is very important in a system that handles social and account-level actions.

### Stats dashboard

The app also now includes an admin stats tab that reports values the app can actually calculate from existing database data, such as:

- number of accounts
- number of runs
- approved runs
- pending and rejected submissions
- total follows
- total notifications
- profiles with approved runs
- most-followed user and follower count

This keeps the stats panel grounded in real data rather than invented metrics.

---

## Versioned builds and archived releases

The project keeps historical builds under the versions directory. These are frozen snapshots rather than live app states.

This is valuable because:

- older versions can still be accessed
- regression comparisons are easier
- historical builds remain available for players and maintainers
- the current build and the archived builds are kept separate

This is an operational choice, not a cosmetic one. It gives the project a release history and makes it easier to compare current behavior against old versions.

---

## Architecture overview

The app is built around a split architecture:

- React frontend for UI and gameplay
- Cloudflare worker for API logic and validation
- D1 database for persistence
- static hosting for the current web app
- archived versions for historical frontends

### Frontend layer

The frontend handles:

- gameplay flow
- run state and UI
- login and session state
- profiles and leaderboards
- admin UI
- notification display
- social state rendering

### Worker layer

The worker handles:

- auth checks
- run validation
- leaderboard queries
- social logic
- moderation routes
- database access and cleanup
- passcode enforcement

### Database layer

The D1 database stores the main state of the platform such as users, sessions, runs, submissions, follows, notifications, admin audit log rows, and mirrored data.

This split is important because it keeps the frontend lightweight while letting the backend enforce rules and maintain real authority over the platform state.

---

## Key database tables

The app relies on a fairly rich schema for a project of this size. The main tables include:

### users

Stores account identity, username, display name, and creation metadata.

### sessions

Stores active user sessions and token-based auth state.

### runs

Stores the actual run history and challenge details.

### submissions

Stores the evidence, review state, and moderation data for leaderboard entries.

### follows

Stores social graph relationships between users.

### notifications

Stores feed items for user activity and updates.

### admin_audit

Stores moderation actions and activity records, including profile badge changes.

### player_data

Stores mirrored browser state, local preserved settings, and player history.

### trashed_runs

Stores hidden or removed run markers without destroying the original run data.

### profile_badges

Stores the text and color of badges admins assign to player profiles. The `Owner`
badge on `@geometricalmike` is built into the profile response and cannot be edited
or removed.

This model is what makes the social and moderation systems possible without relying on a single giant unsafely-structured JSON blob.

The admin panel's **Badges** tab lets moderators search for a user, assign multiple
badges, and edit or remove them. Apply database migrations before deploying worker
changes that use new schema:

```bash
npm run db:migrate
npm run worker:deploy
```

---

## Local development workflow

To work on the project locally, you generally need both the frontend and the worker running at the same time.

### Install dependencies

```bash
npm install
```

### Start the frontend

```bash
npm run dev
```

### Start the worker

```bash
npm run worker:dev
```

Use separate terminals for the frontend and the worker so you can test the UI and the API together without needing to redeploy every time.

---

## Deployment workflow

The app has a split deployment model:

- frontend is deployed with GitHub Pages
- worker and database are deployed on Cloudflare Workers and D1

This means deployment is intentionally two-part instead of one monolithic push.

### Frontend deploy

```bash
npm run deploy
```

This does the frontend build and publishes the static site to GitHub Pages.
The custom-domain file is kept at `public/CNAME`, so Vite copies it into
`dist/CNAME` on every build and `gh-pages` keeps the domain attached when it
publishes that directory. Do not put the only copy of `CNAME` directly on the
generated `gh-pages` branch: the next deployment replaces that branch's files.

### Database migration

```bash
npm run db:migrate
```

This applies D1 schema changes and should be run before any worker deployment when the schema changes.

### Worker deploy

```bash
npm run worker:deploy
```

This deploys the worker logic and API layer to Cloudflare.

### Full order

```bash
npm run db:migrate
npm run worker:deploy
npm run deploy
```

This sequence matters because the database schema and the worker logic need to match before the live system can be trusted.

---

## Project structure

```text
.
├── admin/                   # standalone admin entry page
├── public/                  # generated public data and static files
├── redeem/                  # redeem page entry point
├── scripts/                 # build, migration, and utility scripts
├── src/                     # frontend React app
│   ├── components/          # UI panels, dialogs, leaderboard components
│   ├── data/                # changelog/version metadata
│   ├── hooks/               # timers, auth, countdowns, settings, data hooks
│   ├── pages/               # home, profile, results, leaderboard, admin pages
│   ├── services/            # API and worker request helpers
│   ├── utils/               # validation, challenge logic, utilities
│   ├── App.jsx              # root app and routing
│   ├── App.css              # main app styling
│   ├── index.css            # theme and base CSS
│   └── main.jsx             # render entry point
├── versions/                # archived historical builds
├── worker/                  # Cloudflare worker and server-side logic
│   ├── migrations/          # D1 schema files
│   └── *.test.js            # backend test files
├── challenge-list.json       # challenge list snapshot
├── impossible-levels.json    # impossible list snapshot
├── index.html               # app entry file
├── package.json             # scripts and dependency list
├── vite.config.js           # Vite config
├── wrangler.jsonc           # Cloudflare config and bindings
├── README.md                # this project documentation
├── PROJECT_EXPLAINER.md     # longer conceptual overview of the app
├── eslint.config.js         # linting config
├── .gitignore               # ignored local and generated files
└── ...
```

This project is intentionally split between the browser app and the backend API, which is why the repository contains both frontend and worker logic.

---

## Testing and validation

The project has a real test layer for the worker and supporting services, which is important because the backend owns a large amount of the platform logic.

### Main worker tests

```bash
npm run worker:test
```

### Render tests

```bash
npm run test:render
```

### Service tests

```bash
npm run test:services
```

### Full suite

```bash
npm test
```

### Linting

```bash
npm run lint
```

Because the project includes authentication, moderation, run validation, follows, and notifications, testing is not optional. These systems are easy to break in subtle ways if they are not validated.

---

## Security and moderation protections

The project includes multiple protection layers because it is not just a static challenge site, but a community app with user data and moderation.

### Passcode-protected admin routes

Admin endpoints use a passcode model and enforce it server-side. This prevents casual access to moderation routes.

### Lockout system

Wrong passcode attempts can trigger lockouts so repeated guessing is less effective.

### URL validation

Submission links are checked before they are accepted. Dangerous or malformed URLs are rejected.

### Social cleanup on account deletion

Follow data and related social records are removed when an account is deleted to prevent stale relationships.

### Audit logging

Admin actions are recorded in an audit table so there is accountability for moderation decisions.

These layers are important because once the app becomes a real community platform, safety and trust become operational concerns rather than optional extras.

---

## Privacy and data handling

The project is designed to keep personal data limited and understandable.

- no email-based identity system is required
- passwords are not stored directly in plain text
- usernames are kept as account identity markers
- sessions are validated server-side
- public profile state remains distinct from private account state
- video proof is stored as a link rather than a hosted local file
- profanity can be hidden in display output without destroying the original stored data
- moderation actions are logged instead of silently disappearing

This is a sensible approach for a challenge community where public stats and personal run history are important, but people still need privacy and control over their account identity.

---

## Troubleshooting

### The frontend loads but no data appears

Check whether the worker is running and whether the frontend is hitting the correct API route.

### The worker fails after a schema change

Run the migration before redeploying:

```bash
npm run db:migrate
npm run worker:deploy
```

### GitHub Pages still shows old content

This is usually a cache issue. Hard-refresh and make sure the deployment completed successfully.

### Social counts look stale

The project explicitly refreshes social state from the backend. This usually means the page is not reloading social data or the data is not yet synced on the server.

### Admin tools do not work

Check the passcode, the worker secret, and whether the route is being called with the correct headers.

### Archived versions do not match the live app

That is expected. Archived builds are frozen historical snapshots, not active app builds.

---

## Tech stack

- React 19
- Vite 8
- Cloudflare Workers
- Cloudflare D1
- GitHub Pages
- Wrangler
- ESLint
- Git

This stack is a good fit for a challenge game that needs both a modern frontend and a real backend that can handle users, moderation, and live community data.

---

## Contributing

Contributions are welcome in areas such as:

- gameplay balance and tuning
- UI polish and accessibility work
- moderation tool improvements
- profile/social enhancements
- performance fine-tuning
- backend validation and edge-case fixes
- documentation and release notes
- deployment workflow improvements

A healthy contribution flow is:

1. fork the repo
2. create a branch for the feature or fix
3. make a focused change
4. validate the relevant tests
5. open a clear pull request with context

This project is especially good for contributors who enjoy full-stack work across frontend, worker API, database logic, and deployment workflow.

---

## Credit and sources

Built around a community-first Geometry Dash challenge format.

The project pulls from and supports a number of community list sources, including:

- Pointercrate
- AREDL
- Global S****y List
- Challenge List
- Impossible Levels List

The project’s logic, social layer, leaderboard system, and moderation tooling are designed to support a live community challenge platform rather than simply hosting a one-off randomizer.

---

## Short version

GD List Roulette is a Geometry Dash challenge roulette app built with React, Vite, Cloudflare Workers, and D1. It turns curated community lists into random challenge runs, stores player progress in accounts, supports public profiles and follows, adds notification and moderation systems, tracks leaderboard submissions, preserves archived builds, and uses a split frontend/backend deployment model.

In short: this is a full challenge-community platform built around randomized gameplay, public competition, user accounts, social interaction, and moderation.
