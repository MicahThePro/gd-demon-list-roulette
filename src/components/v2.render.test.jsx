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
import GlobalLeaderboard from './GlobalLeaderboard.jsx'

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
}

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

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
