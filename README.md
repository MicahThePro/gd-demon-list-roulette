<div align="center">

# GD Demon List Roulette

**Extreme Demon Roulette, rebuilt for the web.**

[**Play it live**](https://micahthepro.github.io/gd-demon-list-roulette/) · [Report an issue](https://github.com/MicahThePro/gd-demon-list-roulette/issues)

</div>

---

## The challenge

You get a random level from a demon list and have to hit the target percentage on it. Clear it, and the target goes up on a **new** random level. Miss it, and the run is over.

At the default step that's 1%, 2%, 3% … all the way to 100% — 100 levels, one streak, no second chances. Clear a 100% level and you win.

Simple to explain, brutal to actually do.

## Features

- **Five level lists** — Pointercrate, AREDL, Global Shitty List, Challenge List, and Impossible Levels List
- **Configurable difficulty** — any step from 1% to 100%. 1% is the classic 100-level grind, 5% is a 20-level sprint, 50% is two levels and a coin flip
- **Rank ranges** — narrow any list down to a brutal slice, like Impossible Levels ranks 1–50
- **Live data** — counts and levels are read on demand, never hardcoded
- **Real level IDs, names, creators and thumbnails** across every list
- **Save codes** — encode a run to a string and pick it up on another device
- **Resumable** — your run survives a refresh
- **Per-level timer**, with average time per level on the results screen
- **No accounts, no backend, no tracking**

## Getting started

```bash
git clone https://github.com/MicahThePro/gd-demon-list-roulette.git
cd gd-demon-list-roulette
npm install
npm run dev
```

Then open the local URL Vite prints, usually `http://localhost:5173`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Refresh the list snapshots, then build to `dist/` |
| `npm run deploy` | Publish `dist/` to GitHub Pages |
| `npm run lint` | Run ESLint |
| `npm run preview` | Serve the production build locally |
| `npm run update:challenge-list` | Re-scrape the Challenge List snapshot only |
| `npm run update:impossible-levels` | Re-fetch the Impossible Levels snapshot only |

## How the list data works

Two of the five lists can't be read directly from a browser, because
[challengelist.gd](https://challengelist.gd/) and
[impossiblelevels.com](https://impossiblelevels.com/) send no CORS headers.
That's a browser security rule, not something an app can work around, so both
go through a [Cloudflare Worker](worker/index.js) that re-serves them with CORS
enabled. The other three are read live from their own APIs.

`npm run build` also writes a JSON snapshot of the two proxied lists. The app
tries the Worker first and falls back to the snapshot if it's unreachable, so
the site keeps working if the Worker goes down or you're offline.

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
