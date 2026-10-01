<div align="center">

# GD List Roulette

**Extreme Demon Roulette, rebuilt.**

[**Play it live**](https://micahthepro.github.io/gd-list-roulette/) · [Report an issue](https://github.com/MicahThePro/gd-list-roulette/issues)

</div>

---

## The challenge

You get a random level from a chosen list and have to hit the target percentage on it. Clear it, and the target goes up on a **new** random level. Miss it, and the run is over.

At the default step that's 1%, 2%, 3% … all the way to 100% — 100 levels, one streak, no second chances. Clear a 100% level and you win.

Simple to explain, brutal to actually do.

## Features

- **Five level lists** — Pointercrate, AREDL, Global Shitty List, Challenge List, and Impossible Levels List
- **Configurable difficulty** — any step from 1% to 100%. 1% is the classic 100-level grind, 5% is a 20-level sprint, 50% is two levels and a coin flip
- **Rank ranges** — narrow any list down to a brutal slice, like Impossible Levels ranks 1–50
- **Live data** — counts and levels are read on demand, never hardcoded
- **Rate and version badges** — Impossible Levels entries show the TPS or FPS they need, and the game version, when the list provides one
- **Real level IDs, names, creators and thumbnails** across every list
- **Accounts** — a username and a password, no email address and nothing to confirm
- **An editable display name** — separate from your username, changeable once a day with a live countdown while you wait
- **Runs follow your account** — sign in on another device and everything you have played is there, not just in this browser
- **Global leaderboard** — five boards, filterable by list, with video proof checked before a run counts
- **Submit whenever you like** — send a run from your own leaderboard, not only from the results screen right after you finish
- **Save codes** — encode a run to a string and pick it up on another device
- **Leaderboard** — your best run and full history, with per-run level breakdowns
- **Resumable** — your run survives a refresh, and your chosen list is remembered too
- **Quit mid-run** — abandon a run without it counting as a give-up or reaching the leaderboard
- **Per-level timer**, with average time per level on the results screen
- **Works on phones and tablets** — touch-friendly controls and a layout built for small screens
- **Play any past version** — each release in What's new opens a frozen copy of that version
- **No tracking** — an account is a username and a password, and there is no analytics script anywhere on the site

## What’s new in v2.3
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
### Every past version is playable
Each release in **What’s new** has a **Play this version** link that opens a frozen
copy of that version in a new tab. Nothing you do there touches the current site.
### Disabled buttons look disabled
There was no styling for the disabled state, so a button that could not be pressed
looked exactly like one that could. The only way to find out was to click it and
watch nothing happen.

## What’s new in v2.2

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

### Usernames keep their capitalisation

A username now keeps the capitalisation you gave it. `DemonRoulette` stays
`DemonRoulette` on the leaderboard instead of being quietly lowercased.

Signing in still ignores case — `DEMONROULETTE`, `demonroulette` and
`DemonRoulette` all find the same account — and the handle you registered is the
one you get back, so signing in never renames your account.

Because signing in ignores case, uniqueness has to as well. A name is yours in
every spelling: nobody else can register `demonroulette` if you hold
`DemonRoulette`, and the sign-up form says so before you type rather than after.

## Getting started

```bash
git clone https://github.com/MicahThePro/gd-list-roulette.git
cd gd-list-roulette
npm install
npm run dev
```

Then open the local URL Vite prints, usually `http://localhost:5173`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Build to `dist/` |
| `npm run deploy` | Publish `dist/` to GitHub Pages |
| `npm run lint` | Run ESLint |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the Worker and render tests |
| `npm run worker:dev` | Run the Cloudflare Worker locally |
| `npm run worker:deploy` | Deploy the Cloudflare Worker |
| `npm run db:migrate` | Apply pending D1 migrations to the remote database |
| `npm run update:challenge-list` | Re-scrape the Challenge List snapshot only |
| `npm run update:impossible-levels` | Re-fetch the Impossible Levels snapshot only |

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
  before they are stored, as `iterations:salt:hash`. The plaintext is never
  written down in any form, and there is no password reset — an account is
  identified by its username and that is the only way back in.
- **Usernames are 3–20 characters**, from letters, numbers, dots and underscores.
  Capitalisation is kept, and a name is unique in every case.
- **Display names are up to 40 characters** and are shown on the leaderboards. They
  are separate from the username so a handle can never carry characters that would
  break a leaderboard row.
- **Sessions are tokens held in this browser**, and they expire. The site is served
  from GitHub Pages while the API is a Cloudflare Worker, so the session travels in
  an `Authorization` header on every request rather than relying on a cookie the
  browser would refuse to attach cross-site. A `SameSite=Lax` cookie is set as
  well, as a fallback for reloads.
- **Signing in is deliberately quiet about who exists.** A wrong username and a
  wrong password return the same message and take about the same time, so the
  response never confirms that a particular account is real.
- **Playing never requires an account.** The whole game runs offline in the
  browser. An account is only what makes your runs follow you between devices and
  what lets you go on the global leaderboard.

## Where your runs live

There are two stores, and they do different jobs.

**This browser** keeps finished runs locally — in a `localStorage` mirror for
export fidelity and a `demon-roulette-history` cookie as a fallback. This is the
source of truth for a run you have just played, and it works with no account and no
connection at all.

**Your account** holds the runs you explicitly save to it from the results screen.
That is a deliberate copy: saving is a separate action from playing, and a run is
recorded locally either way, so nothing is ever lost by not saving.

Signing in merges the account's runs into the local board, so the same account on
another device shows the same history. It is a merge rather than a replacement
because a device may hold runs the account has not seen yet — but a run deleted on
one device does not come back on another.

Cookies cap out around 4 KB, so the cookie copy is compacted automatically: rounds
are stored as short tuples rather than objects, and the oldest runs keep fewer
levels once you're deep into the list. The `localStorage` mirror has no such cap,
which is why export and import read from it. A caption shows how many of the 20
available slots are in use.

The global leaderboard is separate again, and only ever holds runs that were
submitted with a video and watched by a reviewer.

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

## Tech stack

- [React 19](https://react.dev/) and [Vite 8](https://vite.dev/)
- [Cloudflare Workers](https://workers.cloudflare.com/) for the list proxy, the accounts and the global leaderboard
- [Cloudflare D1](https://developers.cloudflare.com/d1/) for accounts, runs and submissions
- [GitHub Pages](https://pages.github.com/) for hosting

The site and the Worker are deployed separately. The frontend is a static bundle
on GitHub Pages; the Worker and its database are deployed with Wrangler. Because
Pages and the Worker are different origins, every API call is cross-origin and
needs CORS headers, and the session token is sent as a header rather than relied
on as a cookie.

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
