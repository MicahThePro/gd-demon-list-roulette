<div align="center">

# GD List Roulette

**Extreme Demon Roulette, rebuilt.**

[**Play it live**](https://micahthepro.github.io/gd-list-roulette/) · [Report an issue](https://github.com/MicahThePro/gd-list-roulette/issues)

</div>

---

## Contents

- [The challenge](#the-challenge)
- [Features](#features)
- [How a run works](#how-a-run-works)
- [Rules and settings](#rules-and-settings)
- [Playing old versions](#playing-old-versions)
- [What is new in v2.3](#what-is-new-in-v23)
- [What is new in v2.2](#what-is-new-in-v22)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Accounts](#accounts)
- [Where your runs live](#where-your-runs-live)
- [The global leaderboard](#the-global-leaderboard)
- [Save codes](#save-codes)
- [How the list data works](#how-the-list-data-works)
- [Rate and version badges](#rate-and-version-badges)
- [Snapshots](#snapshots)
- [Deploying the site to GitHub Pages](#deploying-the-site-to-github-pages)
- [Deploying the Worker and the database](#deploying-the-worker-and-the-database)
- [Project layout](#project-layout)
- [Tech stack](#tech-stack)
- [Privacy](#privacy)
- [Credits](#credits)

---

## The challenge

You get a random level from a chosen list and have to hit the target percentage on it. Clear it, and the target goes up on a **new** random level. Miss it, and the run is over.

At the default step that's 1%, 2%, 3% … all the way to 100% — 100 levels, one streak, no second chances. Clear a 100% level and you win.

Simple to explain, brutal to actually do.

## Features

### The game

- **Five level lists** — Pointercrate, AREDL, Global Shitty List, Challenge List, and Impossible Levels List
- **Configurable difficulty** — any step from 1% to 100%. 1% is the classic 100-level grind, 5% is a 20-level sprint, 50% is two levels and a coin flip
- **Rank ranges** — narrow any ranked list down to a brutal slice, like Impossible Levels ranks 1–50
- **Real level IDs, names, creators and thumbnails** across every list
- **Per-level timer**, with average time per level on the results screen
- **Resumable** — your run survives a refresh, and your chosen list is remembered too
- **Quit mid-run** — abandon a run without it counting as a give-up or reaching the leaderboard
- **Skip reasons** — when you skip a level you can say why (too hard, bad luck, unfair/glitched, no time, not feeling it), and the reason is kept with the level
- **Optional time limits** — per level and per run, so a run can be played as a speedrun
- **Works on phones and tablets** — touch-friendly controls and a layout built for small screens
- **No tracking** — there is no analytics script anywhere on the site

### Your data

- **Accounts** — a username and a password. No email address and nothing to confirm
- **Runs follow your account** — sign in on another device and everything you have played is there
- **Leaderboard** — your best run and full history, with per-run level breakdowns, per-level times, skip counts and skip reasons
- **Every run can be deleted** individually, and there is a **Clear all**
- **An editable display name** — separate from your username, changeable once a day with a live countdown while you wait
- **Save codes** — encode a run to a string and pick it up on another device
- **Export and import** — copy your whole history to one string and restore it anywhere, merging without duplicates

### The site

- **Live data** — counts and levels are read on demand, never hardcoded
- **Rate and version badges** — Impossible Levels entries show the TPS or FPS they need, and the game version, when the list provides one
- **Show uncensored level names** — a switch for masking swear words in level names, off by default
- **Global leaderboard** — five boards, filterable by list, with video proof checked before a run counts
- **Submit whenever you like** — send a run from your own leaderboard, not only from the results screen right after you finish
- **Play any past version** — each release in *What's new* that has a frozen build opens in a new tab

## How a run works

1. Pick a list, a step size, and optionally a rank range.
2. Start the run. A random level is drawn and a target percentage is set.
3. Play the level and hit the target.
   - **Clear** → the target rises by one step and a *different* random level is drawn.
   - **Miss** → the run ends and the result is recorded.
   - **Skip** → recorded as skipped, if you have enabled skipping, and the target still
     rises. You can attach a reason.
4. Clear a 100% level and the run is a win.

A run keeps its own rules. Changing a setting mid-run does not change the run you are
already playing, and a save code carries the rules it was started under — so loading a
code on another device does not silently apply that device's settings instead.

## Rules and settings

Settings live in this browser, one cookie per setting, so clearing one does not wipe the
others.

- **Allow skipping** — **off by default.** That is the harder default on purpose: a run
  played straight through is the one people trust on a leaderboard. Turn it on and the
  Skip button appears; turn it off and the only way past a level you cannot beat is to
  end the run. Anyone who already had a saved choice keeps it, because that was a
  decision they made rather than a default they never saw.
- **Time limit per level** — whole minutes, up to 600, with 0 meaning off. When it runs
  out that level ends the run and is recorded as **Timed out**, separately from
  **Failed**, so you can tell the two apart later. Useful for stopping yourself grinding
  one level for an hour.
- **Time limit for the whole run** — turns the game into a speedrun: clear as many
  levels as you can before the clock runs out, and the results screen tells you how far
  you got.
- **Show uncensored level names** — off by default, so the site looks exactly as it did
  before. A few level names contain a swear word and were starred out on every screen
  with no way to see the real name. Turning the mask off shows the names as their
  creators typed them everywhere they appear — in the game, in your runs, and on the
  leaderboard. You are warned while it is on. The names themselves were always stored in
  full, so nothing changes about your runs or anyone else's: only what is drawn on
  screen.
- **Difficulty step** — any percentage from 1 to 100, remembered between visits.
- **Chosen list** — remembered, so a reload does not reset it.

Both time limits show a live countdown on the run screen, and it turns red for the last
30 seconds, so the end of a run is a warning rather than a surprise.

## Playing old versions

Every release in **What's new** that has a frozen build has a **Play this version**
link, which opens that version in a new tab. Nothing you do there touches the current
site.

A frozen version is a complete static build of that release's own `dist/`, published
under `versions/<tag>/`. The app is built with a relative base, so an old build works
from whatever directory it is served out of and keeps working wherever it is copied to.

`v1.1` through `v2.2` currently have builds. The link only appears for versions a build
actually exists for — a link to a version that was never built would look like a broken
feature rather than a missing one, so that claim is made deliberately, by whoever ran the
build.

## What is new in v2.3
v2.3 is a fix-and-polish update. It does not change how the game plays; it makes
the account and leaderboard behave the way you would expect.

### Finished runs save to your account on their own
Finish a run while signed in and it is saved to your account straight away. There
is no box to tick and nothing to remember to do — the run is on your account by
the time the results screen appears.
Saving to your account and submitting to the global leaderboard are still two
separate things. A run is saved to your account either way; putting it on the
public board is your choice, and still needs a video.

### Every run can be deleted
Any run in **Your runs** can be deleted, not only the ones you have not
submitted. Deleting a run that is on the global leaderboard takes it off the
board too. **Clear all** works on every run rather than only the safe ones.

### Runs are no longer stored on your device
Runs used to be kept in this browser as well as on your account. They are not
anymore. A device-held board looked harmless on a personal browser and was a data
leak on a shared one: signing out of one account and into another merged the two
boards, so the next account saw runs that belonged to somebody who was not signed
in. Your account is now the only place runs are kept.

Two consequences worth knowing. **Your runs board is not shown while signed out** —
there would be nothing on it, so there is a line saying so and a link to sign in
instead. And a run you finish while signed out is not saved anywhere at all, not on
this device and not on the leaderboard; sign in or create an account afterwards and
you are asked whether to keep it, and nothing is saved without being agreed to.

Anything already stored from before this change is kept, not deleted — it simply is
not shown until you sign in, and signing in replaces it with the runs on your
account. The old local keys are cleared once so they are not left behind holding
somebody's play history.

### Your display name is editable, once a day
Open your account and there is a **Change display name** button under your name.
Type a new one, save, and it changes everywhere at once — the leaderboard, the
admin panel, and searches.
You can change it once a day. In between, the button is greyed out with a live
countdown sitting in the same spot showing exactly how long is left. It unlocks on
its own — leave the tab open across the deadline and it comes back to the second,
with no reload.
The wait runs from your last change rather than from midnight, so it cannot be
stepped over by timing a change either side of a day boundary.

### Display name and username are different things
Your username is yours for good and is what you sign in with; the display name is
only the label you show. Both now appear on the leaderboard, so a run by “Alex”
with `@alex2` beside it is one person and not somebody pretending to be another.
Previously only the display name was shown, so two players who picked the same
name were indistinguishable.

### Signing in no longer mixes up two accounts
On a shared browser, signing out of one account and into another used to leave the
first account’s runs on screen under the second account’s name. Runs now belong to
one account at a time, and signing out clears them.

### Ending a preview no longer signs you out
Closing a moderator preview used to throw away the session the moderator was
actually using, so they had to sign in again. It now ends only the preview.

### Every past version with a build is playable
Every release in **What's new** that has a frozen build has a **Play this version** link
that opens that version in a new tab. Nothing you do there touches the current site.
`v1.1` through `v2.2` currently have builds.

### Disabled buttons look disabled
There was no styling for the disabled state, so a button that could not be pressed
looked exactly like one that could. The only way to find out was to click it and
watch nothing happen.

## What is new in v2.2

### Submitting a run whenever you like

You can now send a run to the global leaderboard from your own leaderboard, not
only from the results screen right after you finish. Open any run in **Your runs**
and the same submit form is there: paste a link to a video, pick the file type,
and send it.

This is for the run you finished and then walked away from. Previously that run was
only ever submittable in the moment — leave the results screen and it was gone as
far as the leaderboard was concerned, and the only way to put it up was to play it
again.

### A run can only be sent once

Sending the same run again is refused, whether it is still waiting to be checked,
was turned down, or is already on the leaderboard. Nothing can end up on the board
twice by accident.

If you think a video was judged unfairly, send a *different* run rather than
sending the same one again — the refusal is on the run, not on the attempt.

### AREDL runs can be submitted at all

Runs on the AREDL list could not be submitted, and were told they were not one of
the five ranked lists even though AREDL is one of them. That is fixed, and AREDL
runs now also appear under AREDL in the global leaderboard’s list filter rather
than only under **All lists**.

The underlying cause was the list of rankable names existing in three places, one
of which had AREDL spelled out in full while the rest of the app used the
abbreviation. There is now one list, derived from the same source the list loader
uses, so a list cannot end up playable but unsubmittable again.

### Codes survive being copied

Save codes and leaderboard codes now load even if the copy wrapped onto more than
one line.

A full run is a very long code. Long codes get wrapped by text boxes, phones and
chat apps — and a wrapped code used to report itself as invalid, which looks
exactly like a broken code and is not one. Genuinely damaged codes are still
rejected.

### Usernames are normalised, not retyped
Usernames are always stored lowercase. Whatever case you type one in, it becomes one
spelling, so a handle cannot be two accounts that are hard to tell apart.

Signing in still ignores case — `DEMONROULETTE`, `demonroulette` and
`DemonRoulette` all find the same account — and the handle you registered is
the one you get back, so signing in never renames your account.

Because signing in ignores case, uniqueness has to as well. A name is yours in
every spelling: nobody else can register `demonroulette` if you hold
`DemonRoulette`, and the sign-up form says so before you type rather than after.

Display names are the opposite, and unchanged: they keep the capitalisation you
chose, and two players are allowed to have the same one. The handle beside your name
on the leaderboard is what tells two "Alex"es apart.


## Getting started

Requires Node.js 20 or newer.

```bash
git clone https://github.com/MicahThePro/gd-list-roulette.git
cd gd-list-roulette
npm install
npm run dev
```

Then open the local URL Vite prints, usually `http://localhost:5173`.

The frontend runs on its own with no secrets. To also run the API and the list proxy
locally, start the Worker in a second terminal with `npm run worker:dev`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Build to `dist/` |
| `npm run deploy` | Build, copy the frozen versions, and publish to GitHub Pages |
| `npm run lint` | Run ESLint |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the Worker, service and render tests |
| `npm run worker:dev` | Run the Cloudflare Worker locally |
| `npm run worker:deploy` | Deploy the Cloudflare Worker |
| `npm run db:migrate` | Apply pending D1 migrations to the remote database |
| `npm run update:challenge-list` | Re-scrape the Challenge List snapshot only |
| `npm run update:impossible-levels` | Re-fetch the Impossible Levels snapshot only |
| `npm run versions:build` | Build a frozen copy of every tagged version |
| `npm run worker:test` | Worker tests only |
| `npm run test:services` | Service and hook tests only |
| `npm run test:render` | Component render tests only |

The two `update:` scripts are optional. Lists are served live by the Worker, so
the committed snapshots are only a fallback and rarely need refreshing.

`db:migrate` is not optional after a schema change — run it **before**
`worker:deploy`, because the new Worker reads columns that do not exist until the
migration has run.

## Accounts

An account is a username, a password and an optional display name. There is no
email address anywhere in the system, so there is nothing to confirm and no message
to wait for.

- **Passwords are 8 characters minimum**, hashed with PBKDF2-SHA256 on the server
  before they are stored, as `iterations:salt:hash`, and compared without an early exit.
  The plaintext is never written down in any form, and there is no password reset — an
  account is identified by its username and that is the only way back in.
- **Usernames are 3–20 characters**, from letters, numbers, dots and underscores, and
  are stored lowercase. Signing in ignores case and uniqueness does too, so a name is
  yours in every spelling.
- **Display names are up to 40 characters** and are what you show. They are not your
  username: the username is your identity and is yours for good, and the display name is
  just the label. Display names keep your capitalisation and two players may share one,
  which is why the leaderboard shows your handle beside your name. They are separate from
  the username so a handle can never carry characters that would break a leaderboard row.
- **You can change your display name once a day.** In your account there is a **Change
  display name** button under your name; type a new one, save, and it changes everywhere
  at once. In between, the button is greyed out with a live countdown in the same spot
  showing how long is left, and it comes back on its own across the deadline with no
  reload. The wait runs from your last change rather than from midnight, so it cannot be
  stepped over across a day boundary.
- **Sessions are tokens held in this browser**, and they expire after 30 days. The
  site is served from GitHub Pages while the API is a Cloudflare Worker, so the
  session travels in an `Authorization` header on every request rather than relying
  on a cookie the browser would refuse to attach cross-site. A `SameSite=Lax` cookie
  is set as well, as a fallback for reloads.
- **Signing in is deliberately quiet about who exists.** A wrong username and a wrong
  password return the same message and take about the same time, so the response never
  confirms that a particular account is real. Signing out works with no connection, and
  clears the runs on screen.
- **Playing never requires an account.** The whole game runs offline in the
  browser. An account is only what makes your runs follow you between devices, and
  what lets you go on the global leaderboard. A run finished signed out is not kept,
  so the account is also what makes a finished run count.

## Where your runs live

**Your account is the only place runs are kept.** There is no second copy on the
device, and there is not a `localStorage` mirror or a history cookie any more.

Signed in, a run you finish is saved straight away. Signed out, a run is not saved
anywhere, and the **Your runs** board is replaced by a line saying so and a link to
sign in. If you finish a run signed out and then sign in, you are asked whether to
keep it.

The upshot is that your account is now a full history rather than a copy that
diverges from the device, so signing in on another device shows the same runs, and
deleting a run on one device means it is gone on all of them.

The **global leaderboard** is separate again, and only ever holds runs that were
submitted with a video and watched by a reviewer. Deleting your own run takes it off
the global board too.

The board keeps at most 20 runs per account. The level name mask and the two time
limits are the only things still stored in this browser, because those describe how
you want to play rather than what you played.

## The global leaderboard

Separate from your own board, and only ever holding runs that were submitted with a
video and watched by a reviewer.

- **Five boards** — Farthest % reached, Most levels cleared, Fastest run, Fewest skips,
  and Most recent. *Fewest skips* is the one to watch if you play clean rather than
  deep.
- **Filterable by list** — the Pointercrate, AREDL, Challenge List, Impossible Levels
  and GSL boards on their own. This includes AREDL, which was broken until v2.2.
- **Your own row is highlighted**, and you are told your rank, how many runs you have
  submitted, and the best you have done. If you are outside the top fifty, the board
  still tells you where you stand.
- **It refreshes on its own every thirty seconds**, so you can leave it open while you
  play and watch your submission appear.
- **A run can only be marked as cleared if it actually has a 100% round behind it**,
  and the percentage a run is ranked on is worked out from the levels you played rather
  than from anything the page asks for. A hand-edited request cannot post a perfect run
  with nothing to show for it.

A run cannot go on the board without a video, and the video has to be watched first. You
pick the file type and paste a link to a video you have already uploaded somewhere — the
site does not host video, so there is nothing to upload and no size limit. Use Google
Drive, YouTube, Discord, OneDrive or anywhere else you already have an account, make it
link shareable, and paste that link. If you use YouTube, upload as **Unlisted** so it
stays off search and off your channel while it is being checked. You can add a note,
which helps if the video has a long intro or the run does not start at 0:00. The reviewer
sees the run's own numbers next to the video, so there is something to compare it
against, and a rejected run gets a note explaining why.

Your own board and the global one are kept apart on purpose, so clearing your own runs can
never be mistaken for clearing the site's.

## Save codes

A run in progress can be encoded to a string, and a whole history can be encoded to one
string too.

- **Save codes** carry a run you have not finished. They are tagged `GDLRS1:` to match
  the site name, so they can never be confused with a leaderboard code. Codes saved with
  the old `DLRS1:` tag, and untagged codes, still load.
- **Export and import leaderboard code** copies every run, every level, every time and
  thumbnail. Paste it on another device and the runs merge into your existing history.
  Re-importing the same code is safe and will not create duplicates, and import works
  with an empty board, which is exactly when you need it to restore a backup.
- **Long codes survive being copied.** A full run is a very long code, and long codes get
  wrapped by text boxes, phones and chat apps. A wrapped code used to report itself as
  invalid, which looks exactly like a broken code and is not one. Genuinely damaged codes
  are still rejected.
- **The level timer does not count time you were away.** Saving and loading a run, or
  closing the tab and coming back, picks up exactly where you left off.

## How the list data works

Two of the five lists can't be read directly from a browser, because
[challengelist.gd](https://challengelist.gd/) and
[impossiblelevels.com](https://impossiblelevels.com/) send no CORS headers.
That's a browser security rule, not something an app can work around, so both
go through a [Cloudflare Worker](worker/index.js) that re-serves them with CORS
enabled. The other three are read live from their own APIs.

Every Worker request re-reads upstream, so the lists stay current without a
rebuild or redeploy.

The same Worker also owns the site’s API — accounts, runs and the global
leaderboard — against a Cloudflare D1 database. It is one deployment and one origin
rather than two, but the two jobs are unrelated: nothing in the list proxy reads or
writes the database, and the API is what does.

### Rate and version badges

Impossible Levels entries often have to be played at a specific rate, and
sometimes on a specific game version. The site shows both, but only on each
level's own page — and the list API doesn't carry either.

The unit genuinely can't be derived from the number. The site labels a level
TPS only when it carries the 2.2 tag, so the same rate appears under both units
across the list: one 240 rate is `240 TPS` while another is `240 FPS`. The
list API's free-text `versionPossible` field is no help either, since it
disagrees with what the site actually renders.

So the Worker reads the rendered badges off the level's own page, and the app
fetches them for the level you're currently on. Each is cached at the edge for a
day and shared between visitors, so this costs one request the first time you
see a level and none after that. Levels with no rate or no version simply show
no badge.

### Snapshots

The `update:` scripts write a JSON snapshot of the two proxied lists into the
repo. The app tries the Worker first and falls back to the snapshot if it's
unreachable, so the site keeps working if the Worker goes down.

Forking this? Deploy your own Worker and point `LIST_WORKER_URL` in
`src/services/listService.js` at it.

## Deploying the site to GitHub Pages

The frontend is a static bundle. `npm run deploy` builds it, copies the frozen old
versions into place, and pushes `dist/` to the `gh-pages` branch using the
[gh-pages](https://github.com/gh-pages/gh-pages) package.

### One-time setup

1. **Check the remote and the tree.**

   ```bash
   git remote -v
   git status
   ```

2. **Check the Vite base.** The site is served from `https://<user>.github.io/<repo>/`,
   a subpath, and `vite.config.js` already sets `base: './'` — a relative base, so a
   build works from whatever directory it is served out of. That is what makes the
   frozen old versions under `versions/<tag>/` work too. Leave it relative. Setting it to
   a hardcoded subpath like `/gd-list-roulette/` would break the site the moment it is
   served from a different path.

   ```js
   export default defineConfig({
     base: './',        // relative on purpose, see above
     plugins: [react()],
   })
   ```

3. **Push your code**, if you have not already.

   ```bash
   git add -A
   git commit -m "Update README"
   git push origin main
   ```

4. **Turn on Pages, once**, in the repo: **Settings → Pages → Build and deployment →
   Deploy from a branch → branch `gh-pages`, folder `/ (root)` → Save**.

   This only has to be done the first time. After it, `npm run deploy` keeps the site
   up to date on its own.

### Every time after that

```bash
npm run deploy
```

That runs `build`, then `copy-versions`, then `gh-pages -d dist`, and publishes. The
site updates within a minute or two.

`gh-pages` needs push access to the repo, so make sure you are authenticated
(`gh auth login`, or a personal access token) and that branch protection is not blocking
the `gh-pages` branch.

**If you pushed and still see the old site:** GitHub Pages caches hard. Hard-reload
with `Ctrl+Shift+R`, and check **Settings → Pages** for a failed deploy. The build log
is on that page and usually says what went wrong.

**Do not commit `dist/`.** It is in `.gitignore` on purpose. `dist/` is what
`gh-pages -d dist` publishes and `vite build` regenerates from scratch every time, so
committing it would duplicate the whole site in the repository for no benefit.

## Deploying the Worker and the database

The site and the Worker are deployed separately. The frontend is a static bundle on
GitHub Pages; the Worker and its D1 database are deployed with Wrangler.

```bash
npm run db:migrate      # after any schema change, and BEFORE the deploy
npm run worker:deploy
```

That order matters: the new Worker reads columns that do not exist until the migration
has run, so deploying first gives you a Worker that errors on every request.

The Worker's name, its CORS origin and the allowed list names live in `wrangler.jsonc`.
If you fork this, change them to your own domain and your own Worker name.

## Project layout

```
src/
  App.jsx                routes and layout
  pages/                 Home, Roulette, Results, Redeem, Admin
  components/            leaderboards, dialogs, submit form
  hooks/                 auth, run state, run history, settings
  services/              list, API, submission and admin clients
  utils/                 codes, roulette rules, censoring, video links
  data/                  changelog and playable versions
worker/                  Cloudflare Worker: list proxy + API
  migrations/            D1 schema, applied by `npm run db:migrate`
scripts/                 snapshot builders, version builds, test harnesses
admin/, redeem/          extra static entry points
versions/                frozen builds of past releases
```

## Tech stack

- [React 19](https://react.dev/) and [Vite 8](https://vite.dev/)
- [Cloudflare Workers](https://workers.cloudflare.com/) for the list proxy, the accounts and the global leaderboard
- [Cloudflare D1](https://developers.cloudflare.com/d1/) for accounts, runs and submissions
- [GitHub Pages](https://pages.github.com/) for hosting
- [ESLint](https://eslint.org/), with tests covering the Worker, the services and component rendering

The site and the Worker are deployed separately. The frontend is a static bundle on
GitHub Pages; the Worker and its database are deployed with Wrangler. Because Pages and
the Worker are different origins, every API call is cross-origin and needs CORS
headers, and the session token is sent as a header rather than relied on as a cookie.

## Privacy

- **No analytics.** There is no analytics script anywhere on the site.
- **No email, ever.** An account is a username and a password, so there is nothing to
  confirm and no message to wait for.
- **No local copy of your runs.** The account is the only place they are kept, so a
  shared browser cannot leak the previous account's history. The old local keys are
  cleared once on load rather than left behind.
- **Passwords are never stored in readable form**, and there is no password reset —
  your username is the only way back in.
- **Videos are not hosted here.** You paste a link to somewhere you already have an
  account.
- **Level names are stored exactly as their creators typed them.** The swear word mask
  changes only what is drawn on screen, not the stored data.


## Credits

Built by [GeometricalMike](https://gdbrowser.com/u/geometricalmike).

Dedicated to [Vortrox](https://gdbrowser.com/u/vortrox),
[KingSammelot](https://gdbrowser.com/u/kingsammelot) and
[Zoink](https://gdbrowser.com/u/zoink).

Level data comes from [Pointercrate](https://pointercrate.com/),
[AREDL](https://aredl.net/), [Global Shitty List](https://globalshittylist.com/),
[Challenge List](https://challengelist.gd/) and
[Impossible Levels List](https://impossiblelevels.com/).
All level names and creators belong to their respective owners.

