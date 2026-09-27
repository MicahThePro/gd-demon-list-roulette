/**
 * The site history shown in the "What's new" dialog.
 *
 * These entries are written by hand rather than generated from git, because
 * they are the user-facing story of what shipped, not a commit log. Several
 * early commits were chores or renames with nothing to show a player, and
 * several of the changes below are grouped into the version they shipped in.
 *
 * Keep it newest first. `id` is stable and is only used as a React key.
 *
 * LATEST_VERSION is derived from the first entry rather than written out, so
 * bumping the version means adding a release at the top and nothing else. The
 * page heading and the "What's new" heading both read from it.
 */
export const SITE_NAME = 'GD Demon List Roulette'
export const CHANGELOG = [
  {
    id: 'v1-6',
    version: 'v1.6',
    title: 'A leaderboard that fits the screen',
    summary: 'The board became a full-page view, and a layout pass across the whole app.',
    changes: [
      'The leaderboard now fills the window on desktop, so opening it no longer resizes or scrolls the page.',
      'Long histories scroll inside the board itself instead of stretching the page.',
      'Export and import buttons no longer stretch into tall columns, whatever the run count.',
      'A proper phone and tablet layout: touch-sized buttons, no accidental zoom on form fields, and respect for the home indicator.',
      'A back button returns you to the start form from the leaderboard.',
    ],
  },
  {
    id: 'v1-5',
    version: 'v1.5',
    title: 'Take your leaderboard with you',
    summary: 'Copy your whole history to a code and restore it anywhere, with nothing lost.',
    changes: [
      'Copy leaderboard code: one string holding every run, every level, every time and thumbnail.',
      'Import leaderboard code: paste it on another device and the runs merge into your existing history.',
      'Re-importing the same code is safe, it will not create duplicates.',
      'Import now works with an empty leaderboard, which is exactly when you need it to restore a backup.',
      'The code is tagged so it can never be mistaken for a normal save code.',
    ],
  },
  {
    id: 'v1-4',
    version: 'v1.4',
    title: 'Know the rate before you start',
    summary: 'Impossible Levels entries now show the TPS or FPS and the game version they need.',
    changes: [
      'Every Impossible Levels level shows the rate it must be played at, like 240 TPS or 1200 FPS.',
      'Levels that need a specific game version show it too, and levels without one simply show nothing.',
      'The rate and version are fetched for the level you are on and cached at the edge, so it is fast and always current.',
      'Quit run: abandon a run mid-game without it counting as a give-up or reaching the leaderboard.',
      'Your chosen list is remembered, so a reload does not reset it.',
    ],
  },
  {
    id: 'v1-3',
    version: 'v1.3',
    title: 'The leaderboard arrives',
    summary: 'Track your best runs with a full breakdown of every level you played.',
    changes: [
      'A leaderboard with tabs for cleared and given-up runs, ranked best first.',
      'Open any run to see every level: thumbnail, target, achieved percentage, result and time.',
      'Per-run totals, average time per level, passed and skipped counts.',
      'The whole thing is stored in your browser. No account, no server, nothing leaves your device.',
      'Older runs automatically keep fewer levels so the browser storage limit is never exceeded.',
    ],
  },
  {
    id: 'v1-2',
    version: 'v1.2',
    title: 'More lists, and they stay current',
    summary: 'Added the Challenge List and Impossible Levels List, and made list data update on its own.',
    changes: [
      'Added the Challenge List and the Impossible Levels List to the five available sources.',
      'Rank ranges on every ranked list, so you can narrow a draw to a brutal slice like Impossible Levels ranks 1 to 50.',
      'List data is read live through a Cloudflare Worker instead of a build-time snapshot, so counts and new levels show up without a redeploy.',
      'Fixed level names being cut off whenever a level had no thumbnail.',
      'A cleaner README explaining how the list data works.',
    ],
  },
  {
    id: 'v1-1',
    version: 'v1.1',
    title: 'The first playable build',
    summary: 'Demon Roulette on the web: clear a target, move up, keep going.',
    changes: [
      'Pick a demon list and start a run at any percentage step from 1 to 100.',
      'Clear the target on a random level and the next one goes up, on a brand new random level.',
      'Miss the target and the run ends. Clear a 100 percent level and you win.',
      'Save codes, so a run can be encoded to a string and picked up on another device.',
      'Per-level timer, and a run that survives a refresh.',
    ],
  },
]

export const LATEST_VERSION = CHANGELOG[0]?.version ?? 'v1.0'
