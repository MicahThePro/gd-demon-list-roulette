/**
 * Renders the new v2 components to HTML and asserts on the markup.
 *
 * A browser is not available in every environment this runs in, and react-dom
 * works on the server. Rendering the real components with the real props is
 * what proves they mount, throw no error, and produce the elements they are
 * supposed to, rather than merely that the file parses.
 *
 * Run with: node --experimental-vm-modules src/components/v2.render.test.js
 */
import { renderToStaticMarkup } from 'react-dom/server'
import process from 'node:process'
import AccountDialog from './AccountDialog.jsx'
import ChangelogDialog from './ChangelogDialog.jsx'
import GlobalLeaderboard from './GlobalLeaderboard.jsx'
import Leaderboard from './Leaderboard.jsx'
import PreviewBanner from './PreviewBanner.jsx'
import { isPlayable, versionUrl } from '../data/versions.js'
import { CHANGELOG } from '../data/changelog.js'

let failures = 0
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  pass  ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`)
  }
}

const signedOut = {
  user: null,
  isRestoring: false,
  isBusy: false,
  error: '',
  setError: () => {},
  signIn: async () => ({ ok: true }),
  signUp: async () => ({ ok: true }),
  signOut: async () => {},
}

const signedIn = {
  ...signedOut,
  user: { id: 1, username: 'player_one', displayName: 'Player One' },
}

console.log('AccountDialog')
{
  const closed = renderToStaticMarkup(<AccountDialog isOpen={false} onClose={() => {}} auth={signedOut} />)
  check('a closed dialog renders nothing', closed === '', closed.slice(0, 80))

  const signInHtml = renderToStaticMarkup(<AccountDialog isOpen onClose={() => {}} auth={signedOut} />)
  check('the sign in form renders', signInHtml.includes('Username') && signInHtml.includes('Password'))
  check('the dialog is labelled for screen readers', signInHtml.includes('aria-modal="true"'))
  check('the dialog gets its own width, not the settings one', signInHtml.includes('account-dialog') && !signInHtml.includes('settings-dialog'))
  check('the password field is masked', signInHtml.includes('type="password"'))
  // react-dom renders the attribute camelCased, so the check matches that.
  check('the password field is not autofilled as a new one', signInHtml.includes('autoComplete="current-password"'))
  check('the dialog is an inline form so Enter submits', signInHtml.includes('<form'))
  check('sign up is offered from the sign in form', signInHtml.includes('Create an account'))
  check('the display name field is hidden before choosing sign up', !signInHtml.includes('Display name'))

  const signingUp = renderToStaticMarkup(
    <AccountDialog isOpen onClose={() => {}} auth={{ ...signedOut, }} mode="signup" />,
  )
  check('the default mode is still sign in', !signingUp.includes('Display name'))

  const accountHtml = renderToStaticMarkup(<AccountDialog isOpen onClose={() => {}} auth={signedIn} />)
  check('a signed in player sees their name', accountHtml.includes('Player One'))
  check('a signed in player sees their handle', accountHtml.includes('@player_one'))
  check('a signed in player gets a sign out button', accountHtml.includes('Sign out'))
  check('a signed in player is not asked to sign in again', !accountHtml.includes('type="password"'))

  const restoring = renderToStaticMarkup(
    <AccountDialog isOpen onClose={() => {}} auth={{ ...signedOut, isRestoring: true }} />,
  )
  check('a restored session says so instead of flashing a form', restoring.includes('Checking your saved sign in'))

  // The results screen opens this same dialog with a run in hand, so the choice
  // about that run has to live here rather than in a second form on the results
  // page. Absent without a run, present with one.
  const withoutRun = renderToStaticMarkup(<AccountDialog isOpen onClose={() => {}} auth={signedOut} />)
  check('with no run in hand the attach choice is not offered', !withoutRun.includes('Put the run I just finished'))

  const withRun = renderToStaticMarkup(
    <AccountDialog isOpen onClose={() => {}} auth={signedOut} pendingRun={{ rounds: [] }} />,
  )
  check('with a run in hand the attach choice is offered', withRun.includes('Put the run I just finished'))
  check('and it is a checkbox, ticked by default', withRun.includes('type="checkbox"') && withRun.includes('checked=""'))
}

console.log('Previewing another account')
{
  /* The preview swaps three separate things -- the app's copy of the player, the
   * board on screen, and the local history -- and each of them used to be left
   * behind on its own, which is how a preview ended up showing one account's name
   * over another account's runs and then signing the moderator out at the end. */

  const previewing = {
    ...signedIn,
    user: { id: 2, username: 'lt4717', displayName: 'lt4717' },
    isPreviewing: true,
  }
  const html = renderToStaticMarkup(<AccountDialog isOpen onClose={() => {}} auth={previewing} />)
  check('the account on screen is the previewed one', html.includes('@lt4717'), html.slice(0, 200))
  check('and not the moderator\'s own account', !html.includes('@player_one'))

  const banner = renderToStaticMarkup(<PreviewBanner username="lt4717" onEnded={() => {}} />)
  check('the banner names who is being previewed', banner.includes('Previewing lt4717') && banner.includes('account'), banner.slice(0, 200))
  // The wording promises the moderator everything they do is done as the player.
  // That is only true if every screen reads the previewed account, which is exactly
  // what this string asserts and what the swap is for.
  check('and says their actions are the player\'s', banner.includes('Anything you do here is done as them'))

  // No preview, no banner: it is not a dismissible notice, so it must not render
  // when there is nothing to end.
  check('no preview renders no banner', renderToStaticMarkup(<PreviewBanner username={null} />) === '')
}

console.log('Changelog, and playing an old version')
{
  /* The changelog offers a frozen build of each old version. The two ways it can be
   * wrong are both worse than not offering the link at all: a link to a version that
   * was never built looks like a broken feature, and a link on the current version
   * is a button that reloads the page you are already on. */
  const closed = renderToStaticMarkup(<ChangelogDialog isOpen={false} onClose={() => {}} />)
  check('a closed changelog renders nothing', closed === '', closed.slice(0, 80))

  const dialog = renderToStaticMarkup(<ChangelogDialog isOpen onClose={() => {}} />)
  check('the current version is marked new', dialog.includes('New'))
  // The live version is already what you are looking at, so a button that reopens it
  // is worse than no button. It is the one entry with no link.
  check(
    'and never offers a link to itself',
    !dialog.includes(versionUrl(CHANGELOG[0].version)),
    versionUrl(CHANGELOG[0].version),
  )

  // Every release in the changelog up to the live one has a frozen build, so each
  // offers a link rather than saying it is unavailable. This is the whole point of
  // the feature: the list in versions.js and the built versions/ directory have to
  // stay in step, and a silent mismatch here would only ever be found by clicking.
  const missing = CHANGELOG.slice(1).filter((release) => !isPlayable(release.version))
  check(
    'every past release has a build to play',
    missing.length === 0,
    missing.map((release) => release.version).join(', '),
  )
  check('and no entry says it is unavailable', !dialog.includes('Not available'))
  check(
    'each playable release links to its own build',
    CHANGELOG.slice(1).every((release) => dialog.includes(versionUrl(release.version))),
  )

  // versionUrl is relative, so it survives the site living on a repository subpath.
  check(
    'a version URL is relative and ends in a slash',
    versionUrl('v1.9') === './versions/v1.9/' && versionUrl('v1.9').endsWith('/'),
    versionUrl('v1.9'),
  )
  check('a version nobody has tagged is not playable', !isPlayable('v0.1'))
}

console.log('Leaderboard, with no import and no export')
{
  const anEntry = {
    id: '1700000000000-AREDL',
    at: 1700000000000,
    source: 'AREDL',
    step: 1,
    status: 'completed',
    score: 100,
    roundsPlayed: 2,
    passed: 2,
    skipped: 0,
    skipReasons: {},
    totalMs: 60000,
    avgMs: 30000,
    rounds: [
      ['a', 'Level A', 1, 100, 'success', 30000, null, null],
      ['b', 'Level B', 2, 100, 'success', 30000, null, null],
    ],
  }

  const props = { onDelete: () => {}, onClear: () => {}, auth: signedOut }
  const withRuns = renderToStaticMarkup(<Leaderboard {...props} entries={[anEntry]} />)
  check('a run is listed', withRuns.includes('100%') && withRuns.includes('AREDL'))
  check('there is no export button', !withRuns.includes('Copy leaderboard code'))
  check('there is no import button', !withRuns.includes('Import leaderboard code'))
  check('and no dialog for one either', !withRuns.includes('DLRH1:'))
  check('clearing the board is still offered', withRuns.includes('Clear all runs'))
  // With nothing on the board there is nothing to clear, so the button goes
  // rather than sitting there doing nothing.
  const empty = renderToStaticMarkup(<Leaderboard {...props} entries={[]} />)
  check('an empty board offers no clear either', !empty.includes('Clear all runs'))
  // The empty message points at signing in rather than at a code that no longer
  // exists, because that is now how a run reaches another device.
  check('the empty message points at the account', empty.includes('sign in') && !empty.includes('leaderboard code'))
}

console.log('GlobalLeaderboard')
{
  const html = renderToStaticMarkup(<GlobalLeaderboard user={null} />)
  check('the five boards are all offered', ['Farthest %', 'Most levels cleared', 'Fastest run', 'Fewest skips', 'Most recent']
    .every((label) => html.includes(label)), html.slice(0, 200))
  check('the farthest board is the default', html.includes('board-chip-active'))
  check('the list filter starts on all lists', html.includes('All lists'))
  check('every list this site plays is filterable', ['Pointercrate', 'AREDL', 'GSL', 'Challenge List', 'Impossible Levels']
    .every((label) => html.includes(label)))
  check('the board announces itself while loading', html.includes('Loading the global leaderboard'))
  check('the board is a labelled tablist', html.includes('aria-label="Leaderboard board"'))
  // The first paint is the loading state, since the board has not been read
  // yet. The empty message belongs to the render after the fetch comes back
  // with nothing, which a static render cannot reach.
  check('a board with no entries yet is not shown as empty', !html.includes('No runs on this board yet'))
  check('nobody is highlighted when signed out', !html.includes('lb-row-you'))
  // The page-level board tabs must not reuse .lb-tabs: that class is a grid
  // child of the leaderboard's own template, so on this page it stacked the
  // buttons and dropped them to the bottom of the panel.
  check('the board chips are not the page-level tabs', !html.includes('board-view-tab'))
  // The list filter has no visible text of its own, so it needs a label that
  // only a screen reader sees. .visually-hidden did not exist until v2, and
  // silently omitting it left the select unlabelled.
  check('the list filter has a screen reader label', html.includes('visually-hidden'))
  // .lb-empty belongs to the leaderboard's own grid. Reusing it here put the
  // message in a grid area that does not exist on this page, which is why it
  // drifted off to the right instead of sitting under the board.
  check('the empty message does not reuse the leaderboard grid class', !html.includes('lb-empty'))

  const boardHtml = renderToStaticMarkup(
    <div className="panel board-page">
      <header className="board-page-bar">
        <h2>Leaderboards</h2>
      </header>
      <div className="board-body">
        <div className="board-view-tabs">
          <button type="button" className="board-view-tab board-view-tab-active">Your runs</button>
          <button type="button" className="board-view-tab">Global</button>
        </div>
      </div>
    </div>,
  )
  // .board-page is a three row grid. The tab strip must not be a direct child
  // of it, because a fourth child is auto-placed into the minmax(0, 1fr) row
  // and stretches to fill the whole panel, which is what made the two buttons
  // tower over the page. Wrapped in .board-body, the row count stays at three.
  const directChildren = boardHtml.match(/<section class="panel board-page">([\s\S]*?)<\/header>[\s\S]*?<\/section>/)?.[1] ?? ''
  check('the tab strip is not a direct child of the three row grid', !/<div class="board-view-tabs">/.test(directChildren))
  check('the tab strip sits inside the list row', boardHtml.includes('<div class="board-body">'))
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
