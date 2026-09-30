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
export const SITE_NAME = 'GD List Roulette'
export const CHANGELOG = [
  {
    id: 'v2-2',
    version: 'v2.2',
    title: 'Submit a run whenever you like, and codes that actually paste',
    summary: 'Send a run to the global leaderboard from your own leaderboard, stop the same run being sent twice, fix AREDL runs being unsubmitable, and make save codes survive being copied.',
    changes: [
      'You can now submit a run to the global leaderboard from your own leaderboard, not just from the results screen right after you finish. Open any run in Your runs, and the same submit form is there: paste a link to a video, pick the file type, and send it. If you finished a run and walked away from it, you can still put it up later without playing it again.',
      'A run can only be sent once. Sending the same run again is refused, whether it is still waiting to be checked, was turned down, or is already on the leaderboard, so nothing can be submitted twice by accident. If you think a video was judged unfairly, send a different run rather than sending the same one again.',
      'Runs on the AREDL list could not be submitted at all, and were told they were not one of the five ranked lists even though AREDL is one of them. This is fixed, and AREDL runs now also show up under AREDL in the global leaderboard’s list filter rather than only under All lists.',
      'Save codes and leaderboard codes now load even if the copy wrapped onto more than one line. A full run is a very long code, and a long code gets wrapped by text boxes, phones and chat apps, which used to make a perfectly copied code report itself as invalid. A code that is genuinely broken is still rejected.',
      'The site now has one list of the five ranked list names instead of three copies of it, so a list cannot be playable but unsubmittable again.',
    ],
  },
  {
    id: 'v2-1',
    version: 'v2.1',
    title: 'Video proof, and runs that are checked before they count',
    summary: 'Point us at a video of your run when you submit it, and have somebody watch it before it goes on the leaderboard.',
    changes: [
      'A run can now be submitted with a video of it. On the results screen you pick the file type and paste a link to a video you have already uploaded somewhere.',
      'The site does not host video, so there is nothing to upload and no size limit. Upload it to Google Drive, YouTube, Discord, OneDrive or anywhere else you already have an account, make it link shareable, and paste that link.',
      'If you use YouTube, upload as Unlisted rather than public, so the video stays off search and off your channel while it is being checked.',
      'A run cannot go on the global leaderboard without a video, and the video has to be watched first. Your run waits in a queue until somebody has looked at it.',
      'The reviewer sees the run’s own numbers next to the video, so every level you cleared, the percentage you hit and how long each one took are there to compare against what the video shows.',
      'You can add a note with your submission, which helps if your video has a long intro or the run does not start at 0:00.',
      'A rejected run gets a note explaining why, so you know what to change before your next attempt.',
      'The leaderboard itself works exactly as before. Five boards, filterable by list, your own row highlighted. It just holds fewer runs now, because each one has been watched.',
    ],
  },
  {
    id: 'v2-0',
    version: 'v2.0',
    title: 'Accounts, and a leaderboard everybody shares',
    summary: 'Sign in, submit a run, and see how far everyone else got. Five different boards, filterable by list, with your own row highlighted.',
    changes: [
      'You can now make an account with a username and a password. There is no email address involved, so there is nothing to confirm and no message to wait for.',
      'Your password is hashed on the server before it is stored, and is never written down in readable form. Signing in gives you a token that lives in this browser only, so the account is not tied to a device you might lose.',
      'The results screen has a Submit run button. Sign in and any run you finish can be sent to a global leaderboard that everyone can read, whether or not you have an account.',
      'Submitting is always your choice. A run is recorded in your own leaderboard either way, and the local leaderboard, the export code and the save codes all work exactly as before.',
      'Submitting the same run twice replaces it instead of counting it twice, so there is no way to farm a board by pressing the button again.',
      'A run can only be marked as cleared if it actually has a 100% round behind it, and the percentage a run is ranked on is worked out from the levels you played rather than from anything the page asks for. That means a hand-edited request cannot post a perfect run with nothing to show for it.',
      "The leaderboard page has two tabs now. Your runs is the leaderboard you already had, and Global is everybody who has submitted one. They are kept apart on purpose, so clearing your own runs can never be mistaken for clearing the site's.",
      'Global has five boards: Farthest % reached, Most levels cleared, Fastest run, Fewest skips, and Most recent. Fewest skips is the one to watch if you play clean rather than deep.',
      'Every board can be filtered down to a single list, so you can see the Pointercrate board, the AREDL board, the Challenge List board, the Impossible Levels board and the GSL board on their own.',
      'Your own run is highlighted on the board and you are told your rank, plus how many runs you have submitted and the best you have done. If you are outside the top fifty, the board still tells you where you stand.',
      'The board refreshes on its own every thirty seconds, so you can leave it open while you play and see your submission appear.',
      'The list proxy Worker and the Impossible Levels and Challenge Lists are unchanged. Same Worker, same URLs, it just also holds the accounts and the leaderboard now.',
      'Signing in is remembered between visits, and signing out works even with no connection.',
    ],
  },
  {
    id: 'v1-9',
    version: 'v1.9',
    title: 'Play your way, and say why you skipped',
    summary: 'Skips now carry a reason, settings gained a skip toggle and two optional time limits, and the site has a new icon.',
    changes: [
      'Skipping a level now asks why. Pick Too hard, Bad luck, Unfair / glitched, No time or Not feeling it, and the reason is saved with the level, so you can look back at a run and see what you were actually up against.',
      'The leaderboard breaks the skips down for each run, so you can see at a glance whether you were being careful or rage quitting.',
      'Each level in a run\'s detail view now shows its skip reason, and the levels you played during the run show it too.',
      'You can still skip without picking a reason, and Escape or Cancel backs out without skipping at all.',
      'Allow skipping is now a setting. Turn it off and the Skip button disappears, so the only way past a level you cannot beat is to end the run. It is on by default, so nothing changes unless you ask for it.',
      'Settings also has a time limit per level. Set it in minutes and the moment you run out, that level ends the run. Useful for stopping yourself from grinding one level for an hour.',
      'And a time limit for the whole run, which turns the game into a speedrun: clear as many levels as you can before the clock runs out, and the results screen tells you how far you got.',
      'Both limits show a live countdown on the run screen, and it turns red for the last 30 seconds so the end of the run is a warning rather than a surprise.',
      'A level that runs out of time is recorded as Timed out in the leaderboard, separate from Failed, so you can tell the two apart later.',
      'Rules are locked in when a run starts, so changing a setting mid-run will not change the run you are playing, and a save code carries the rules it was started under.',
      'New site icon! The old default one is gone, so the tab looks like GD List Roulette instead of a blank page.',
    ],
  },
  {
    id: 'v1-8',
    version: 'v1.8',
    title: 'Everything scrolls when it has to',
    summary: 'Short windows now fit properly, any page can be scrolled, and save codes carry the full name.',
    changes: [
      'Every page can now be scrolled when the content is taller than the window. Previously the layout was locked to the window size, so the bottom of a long page could be cut off with no way to reach it.',
      'On a short or half-screen window the layout tightens up automatically: smaller padding, more compact buttons and cards, and the level list shrinks to fit instead of pushing the buttons below it out of the box.',
      'Save codes are now tagged GDLRS1: to match the site name. Codes saved with the old DLRS1: tag still load, and untagged codes still load as before.',
      'Fixed the favicon path so the site icon shows up on the published site.',
    ],
  },
  {
    id: 'v1-7',
    version: 'v1.7',
    title: 'A leaderboard you can read at a glance',
    summary: 'Sort the gave-up tab, full timestamps on every run, and a save code that behaves like a pause.',
    changes: [
      'The Gave up tab now has sort buttons: Highest %, Most levels and Newest, with the ranking following whichever one you pick.',
      'The Succeeded tab stays as a plain list of the levels you cleared, with nothing to sort by.',
      'Runs now show the date as well as the time, so you can tell when a run happened rather than only what hour.',
      'Save codes are now tagged DLRS1: so they can never be confused with a leaderboard code, and older untagged codes still load.',
      'Fixed the level timer counting time you were away. Saving and loading a run, or closing the tab and coming back, now picks up exactly where you left off instead of counting the whole gap as play time.',
    ],
  },
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
