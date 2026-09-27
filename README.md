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
- **Save codes** — encode a run to a string and pick it up on another device
- **Leaderboard** — your best run and full history, stored in a cookie, with per-run level breakdowns
- **Resumable** — your run survives a refresh, and your chosen list is remembered too
- **Quit mid-run** — abandon a run without it counting as a give-up or reaching the leaderboard
- **Per-level timer**, with average time per level on the results screen
- **Works on phones and tablets** — touch-friendly controls and a layout built for small screens
- **No accounts, no tracking**

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
| `npm run worker:dev` | Run the Cloudflare Worker locally |
| `npm run worker:deploy` | Deploy the Cloudflare Worker |
| `npm run update:challenge-list` | Re-scrape the Challenge List snapshot only |
| `npm run update:impossible-levels` | Re-fetch the Impossible Levels snapshot only |

The two `update:` scripts are optional. Lists are served live by the Worker, so
the committed snapshots are only a fallback and rarely need refreshing.

## Leaderboard storage

Finished runs are kept in the `demon-roulette-history` cookie — no account, no
server, nothing leaves the browser. Click any run to see the levels you played,
their target and achieved percentages, and per-level times, or delete it.

Cookies cap out around 4 KB, so the history is compacted automatically: rounds
are stored as short tuples rather than objects, and the oldest runs keep fewer
levels once you're deep into the list. A caption shows how many of the 20
available slots are in use.

## How the list data works

Two of the five lists can't be read directly from a browser, because
[challengelist.gd](https://challengelist.gd/) and
[impossiblelevels.com](https://impossiblelevels.com/) send no CORS headers.
That's a browser security rule, not something an app can work around, so both
go through a [Cloudflare Worker](worker/index.js) that re-serves them with CORS
enabled. The other three are read live from their own APIs.

Every Worker request re-reads upstream, so the lists stay current without a
rebuild or redeploy.

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
- [Cloudflare Workers](https://workers.cloudflare.com/) for the list proxy
- [GitHub Pages](https://pages.github.com/) for hosting

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
