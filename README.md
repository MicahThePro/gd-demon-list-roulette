<div align="center">

# GD List Roulette

**Extreme Demon Roulette, rebuilt and expanded.**

[**Play it live**](https://micahthepro.github.io/gd-list-roulette/) · [**Report an issue**](https://github.com/MicahThePro/gd-list-roulette/issues)

</div>

---

GD List Roulette is a browser-based challenge game built around the idea of a random Geometry Dash run. Instead of picking a level yourself, you start a run, the app picks a level from a configured list, and you try to reach the target percentage. Clear enough levels in a row and you are effectively running a full roulette challenge across the list.

It combines random challenge generation, account-based progression, leaderboard submissions, versioned builds, and a Cloudflare-powered backend. The result is a project that feels like both a game and a small application platform: players play, accounts track history, and admins or contributors can manage runs and data from the same ecosystem.

This README is meant to be more approachable than the previous one. It explains what the project is, how the game works, how to run it locally, how the project is structured, and how the backend and deployment model fit together.

---

## Table of contents

- [What this project is](#what-this-project-is)
- [Why the roulette mechanic works so well](#why-the-roulette-mechanic-works-so-well)
- [Core features](#core-features)
- [How a run works](#how-a-run-works)
- [Rules and settings](#rules-and-settings)
- [What the app does for players](#what-the-app-does-for-players)
- [Playing old versions](#playing-old-versions)
- [Local development](#local-development)
- [Running the frontend and worker together](#running-the-frontend-and-worker-together)
- [Deployment workflow](#deployment-workflow)
- [Project structure](#project-structure)
- [Testing and linting](#testing-and-linting)
- [Privacy and data handling](#privacy-and-data-handling)
- [Tech stack](#tech-stack)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Credits](#credits)

---

## What this project is

GD List Roulette is a fan-made challenge project for Geometry Dash players. The core idea is simple:

- choose a list
- pick a target step size
- get a random level from that list
- reach that percentage
- clear the level and continue to the next one
- fail, skip, or time out and the run ends
- if you clear 100%, you win the run

This is a very direct challenge format, but the project makes it richer by adding account history, list filtering, global leaderboard support, submission notes, run deletion, and older version archives.

It is not just a randomizer. It is a full game loop with persistence and competition.

The project sources its level data from well-known Geometry Dash list communities and supports several list types, including:

- Pointercrate
- AREDL
- Global Shitty List
- Challenge List
- Impossible Levels List

The app is built to be flexible and replayable, while still feeling like a challenge run rather than a generic list viewer.

---

## Why the roulette mechanic works so well

The appeal is that it introduces unpredictability without losing the structure of a challenge. Instead of grinding a list in order, you are forced to react to whatever the app gives you. That makes each run feel different from the last.

This creates a few benefits:

- more variety than a fixed progression
- a stronger sense of achievement when a run survives multiple difficult levels
- an easier way to target a list without spending time picking levels manually
- a better way to compare player performance with clear run records
- a fun format for both casual and highly competitive players

In other words, the roulette system makes a long list of difficult levels feel like a game instead of a spreadsheet.

---

## Core features

### Challenge generation

The app can generate levels from several community lists and supports configurable step sizes, such as:

- 1% steps for longer, more classic runs
- 5% or 10% steps for faster, more compressed runs
- custom ranges to narrow a list down to a subset of levels

This makes the game flexible enough for quick runs, grind sessions, or stricter challenge play.

### Persistent accounts

Players can sign in with a username and password, and their completed runs are tied to their account. This is important because many of the app's features only make sense when runs are retained across sessions and devices.

### Run history and deletion tools

The app keeps run history tied to the player account and allows runs to be reviewed, deleted, or cleared. This is useful for both correction and control over what appears on the leaderboard or in a player's personal history.

### Leaderboards

There are multiple leaderboard modes and filterable board categories. Players can submit runs with video proof and compare themselves against other community members using rankings based on their completed challenge runs.

### Old version compatibility

The project keeps archived builds of older releases in the versions folder so players can still access historical versions of the app. This is especially useful for a project with many updates and a changing UI.

### Censoring and presentation control

The app can mask profanity in level names while still storing the original names on the backend. This is a nice example of preserving data integrity while still making the UI more comfortable to read in public contexts.

### Admin tools and worker logic

A lot of the app's "behind the scenes" functionality is handled by the Cloudflare Worker, including list proxying, authentication, tracking runs, and leaderboard behavior. This allows the project to do more than a purely client-side challenge page.

---

## How a run works

A run follows a predictable loop, but the content is always generated dynamically.

1. Pick a list.
2. Pick a step size and any optional rank filters.
3. Start the run.
4. The app chooses a random level and sets a target percentage.
5. You attempt the level at that target.
6. If you clear it, the target moves up by one step and a new level is picked.
7. If you miss it, the run ends.
8. If skipping is allowed, you can skip the level and still continue, usually with some penalty or record attached.
9. If you reach 100%, the run is complete and you win.

The exact step size matters a lot. A 1% step creates a long challenge with many levels, while larger steps shorten it dramatically. This is part of what makes the app so replayable: the same base system can produce very different experiences just by changing one setting.

One important design detail: the run keeps its own rules. If a player changes settings mid-run, the current run is not rewritten to match the new configuration. This avoids confusion and keeps the run consistent.

---

## Rules and settings

The app has multiple in-browser settings that affect how runs behave. These settings are stored locally rather than hardcoded, which means a player's preferences are remembered between visits.

### Allow skipping

Skipping is off by default. That is intentional: the standard tournament-style run is the one where you push through every level without extra outs. When skipping is enabled, players can skip a level and explain why they did it. That is useful for fairness and for later review of a run.

### Time limits

There are two main time-related settings:

- a time limit per level
- a time limit for the whole run

These can turn a run into a speed challenge, which makes the format more varied. A level timeout is recorded separately from a failed attempt, which helps players understand why a run ended.

### Difficulty step

The step decides how much the target percentage increases after each successful clear. This can be tuned from extremely gradual play to much shorter run lengths.

### List selection

Players can pick the list they want to play from. This does not just change the level pool; it changes the whole feel of the challenge. A difficult list full of precise, punishing levels is a very different experience from a lower-pressure list.

### Rank filtering

The app supports narrowing a list by rank range for more specific challenge formats. This is useful if someone wants to play a subset of the list rather than the whole thing.

### Censor mode

The app can hide swear words in level names by default, which is easier for broad public use. When disabled, the names are displayed in their original form. The data is still stored as-is; the setting only changes what is rendered on screen.

---

## What the app does for players

This project is built around player retention and personal progression, not just one-off challenge attempts.

### Save codes and run carry-over

A run can be encoded into a string that can be loaded on another device. This is useful when a player is mid-run and wants to continue later or share the run state with another device. Large codes are designed to survive copy and paste even if wrapped by chat apps or text boxes.

### History and personal leaderboard

Each account has a personal leaderboard and full run history. Players can inspect their own performance, see which levels they cleared, check how long each level took, and review skip reasons. The history is not just a cosmetic list; it is the core record of the player's progress.

### Leaderboard submission

A run can be submitted with a video link after the fact. The global leaderboard is distinct from the player's personal run history, and a run is only accepted if it truly meets the challenge rules and includes reviewable proof.

### Run deletion and cleanup

Runs can be deleted individually or cleared in bulk. Since runs are tied to an account, deleting one removes it from the relevant places and prevents stale records from lingering in the system.

### Account display names

The app separates the username from the display name. Your username is your permanent identity for login and account matching; your display name is what gets shown in public spaces. This keeps the app readable without making the identity system confusing or clumsy.

---

## Playing old versions

The project keeps old builds of previous releases under the versions folder so older versions can still be opened and played without breaking the current app. This is particularly helpful because projects like this evolve over time, and some players prefer to compare older builds or continue using a known version.

The README and app both treat old versions as frozen builds. They are static builds of previous releases and are served separately from the current app. Nothing you do in an archived build affects the live site.

This is a practical benefit for:

- debugging regressions
- comparing older UI behavior
- preserving release history
- giving players easier access to older builds

---

## Local development

### Prerequisites

You will need:

- Node.js 20 or newer
- npm
- Git
- a Cloudflare Wrangler setup if you want to test the worker and database locally

### Install dependencies

```bash
npm install
```

This installs the dependencies required to run both the frontend and the worker tooling.

### Start the frontend

```bash
npm run dev
```

This runs the Vite development server. The site is usually available at a local URL such as http://localhost:5173.

### Start the worker

```bash
npm run worker:dev
```

This runs the Cloudflare Worker in development mode, which is necessary if you want to test list fetching, account flows, leaderboard APIs, and backend logic.

---

## Running the frontend and worker together

The frontend and backend are separate but complementary systems. In practice, the app works best when both are running at the same time during development.

Typical workflow:

```bash
npm run dev
npm run worker:dev
```

Use one terminal for the front-end and another for the Cloudflare worker. This lets you test the browser UI and the APIs together without needing to redeploy every time.

The frontend alone can still load, but many features depend on the worker being available for real data, authentication, and leaderboard behavior.

---

## Deployment workflow

This project has a split deployment model:

- the frontend is a static bundle hosted on GitHub Pages
- the worker and database live on Cloudflare Workers and D1

That means deployment is intentionally two-part instead of one monolithic process.

### Frontend deployment

```bash
npm run deploy
```

This command does the following:

- builds the app
- copies frozen old version builds into place
- publishes the generated dist folder to the GitHub Pages branch

GitHub Pages uses the gh-pages package to publish the built site. If the page does not update immediately, a hard refresh is often needed. Deployment logs in the repository settings can also help diagnose failures.

Important notes:

- `dist/` should not be committed
- `gh-pages` needs repo push access
- branch protection or deployment settings may block a successful update

### Worker and database deployment

```bash
npm run db:migrate
npm run worker:deploy
```

The migration must happen before deploying the worker after a schema change. This is not optional. If the worker is deployed before the D1 schema has been updated, the new worker may query columns that do not exist yet and fail on requests.

The worker configuration, CORS settings, and allowed list names live in the Wrangler configuration file.

---

## Project structure

```text
.
├── admin/                  # standalone admin entry page
├── public/                 # public static files and generated data
├── redeem/                 # redeem-related static entry point
├── scripts/                # release scripts, data builders, and test helpers
├── src/                    # frontend React app
│   ├── components/         # UI pieces like forms, dialogs, leaderboards, banners
│   ├── data/               # changelog and version metadata
│   ├── hooks/              # custom React hooks for state, timers, auth, and settings
│   ├── pages/              # app pages such as home, roulette, results, redeem, admin
│   ├── services/           # list fetching, API communication, and app logic
│   ├── utils/              # helper functions for codes, roulette, and submission logic
│   ├── App.jsx             # top-level app component and routing layout
│   ├── App.css             # styles for the app shell and pages
│   ├── index.css           # base styling and theme setup
│   └── main.jsx            # app bootstrap
├── versions/               # archived builds of older releases
├── worker/                 # Cloudflare Worker and server-side API logic
│   ├── migrations/         # D1 schema migrations
│   └── *.test.js           # worker test files
├── challenge-list.json      # challenge list fallback snapshot
├── impossible-levels.json  # impossible levels fallback snapshot
├── index.html              # app entry page
├── package.json            # scripts and dependencies
├── vite.config.js          # Vite configuration
├── wrangler.jsonc          # Cloudflare worker configuration
├── README.md               # project documentation
├── eslint.config.js        # linting configuration
├── .gitignore              # ignored build and local artifacts
└── ...
```

The project is organized around a front-end app and a worker API, which is why the repo contains both React code and Cloudflare-related tooling.

---

## Testing and linting

The project includes tests for worker logic, service logic, and render behavior.

### Main test suite

```bash
npm test
```

This runs the project test groups together.

### Focused scripts

```bash
npm run worker:test
npm run test:services
npm run test:render
```

These are helpful when you want to validate a specific area without running the full suite.

### Linting

```bash
npm run lint
```

This runs ESLint to catch code issues and keep the codebase consistent.

---

## Privacy and data handling

The project places a lot of value on respecting player privacy and keeping data usage minimal.

- there are no analytics scripts
- there is no email-based account identity system
- passwords are not stored as plain text
- account identities are based on usernames rather than personal details
- video files are not hosted by the site itself
- the app masks offensive words in display names without altering the stored underlying values
- runs are meant to live on the account rather than be copied to multiple local devices

This is a good fit for a community challenge app because it keeps the system simple while still supporting persistent history and public leaderboard submissions.

---

## Tech stack

- [React 19](https://react.dev/) for the front-end interface
- [Vite 8](https://vite.dev/) for local development and builds
- [Cloudflare Workers](https://workers.cloudflare.com/) for the API and proxy layer
- [Cloudflare D1](https://developers.cloudflare.com/d1/) for the data store
- [GitHub Pages](https://pages.github.com/) for hosting the static front-end
- [ESLint](https://eslint.org/) for linting and code quality checks

Because the site is served from GitHub Pages while the worker is hosted on a Cloudflare origin, the app uses CORS-aware requests and authorization headers rather than assuming all requests come from the same origin.

---

## Troubleshooting

### API requests fail

Check whether the worker is running and whether the CORS configuration matches the frontend origin.

### Old site content is still showing

This is usually a cache issue. Hard refresh and check the deployment logs. GitHub Pages often takes time to propagate a new build.

### Deploy fails after a schema change

Run the migration before deploying the worker:

```bash
npm run db:migrate
npm run worker:deploy
```

### Local app seems incomplete

Make sure the frontend and worker are both running. Many app features depend on the worker being online for data and API responses.

### A run appears inconsistent between devices

If your runs are tied to your account, make sure you are signed in on the correct account. The app intentionally keeps run history account-based instead of mixing local browser state with account state.

---

## Contributing

Contributions are welcome, especially for areas such as:

- gameplay polish
- UI improvements
- accessibility fixes
- leaderboard submission flow improvements
- account and moderation tools
- better documentation
- deployment and build improvements
- old-version compatibility work

A sensible contribution workflow is:

1. fork the project
2. create a feature branch
3. make the smallest relevant change
4. run the relevant test or validation commands
5. open a clear pull request with context and notes

This project is especially friendly to contributors who like working on full-stack web apps, user accounts, worker APIs, and community-driven challenge systems.

---

## Credits

Built by [GeometricalMike](https://gdbrowser.com/u/geometricalmike).

Dedicated to:

- [Vortrox](https://gdbrowser.com/u/vortrox)
- [KingSammelot](https://gdbrowser.com/u/kingsammelot)
- [Zoink](https://gdbrowser.com/u/zoink)

Level data and challenge source content comes from:

- [Pointercrate](https://pointercrate.com/)
- [AREDL](https://aredl.net/)
- [Global Shitty List](https://globalshittylist.com/)
- [Challenge List](https://challengelist.gd/)
- [Impossible Levels List](https://impossiblelevels.com/)

All level names and creators belong to their respective owners and sources.

---

## Short version

If you want the project explained in one sentence: GD List Roulette is a Geometry Dash challenge roulette built with React, Vite, Cloudflare Workers, and D1, where players generate random levels from curated community lists, track their runs in accounts, submit video-verified leaderboard attempts, and keep the experience replayable and extensible over time.

That is the heart of it: a community-oriented challenge game built around random difficulty, persistence, and competition.
