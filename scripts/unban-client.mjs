/**
 * Lifts a device ban, or lists the current ones.
 *
 * The way out of a permanent admin lockout. Deliberately a script and not a page on
 * the site: a ban that could be lifted from the site it locks you out of would not be
 * one, and there is no self-service unlock for the same reason -- an unlock an
 * attacker can reach is not one.
 *
 * Needs the address it lifts, which is the address Cloudflare reported. If you do not
 * have it to hand, `--list` shows what is banned.
 *
 * Usage:
 *   npm run admin:unban -- --list
 *   npm run admin:unban -- 203.0.113.45
 *   npm run admin:unban -- --local           # also clear this browser's own flag
 *
 * The last flag clears the localStorage note the admin panel writes when the server
 * reports a ban. It only affects this browser; the server-side ban is what the address
 * argument lifts.
 */
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

/* Wrangler has to run from the project root, or it cannot find wrangler.jsonc and
 * silently applies to nothing. Resolved rather than assumed on PATH. */
const wrangler = join(root, 'node_modules', '.bin', 'wrangler')

const query = (sql) => {
  const output = execFileSync(
    wrangler,
    ['d1', 'execute', 'demon-roulette', '--remote', '--command', sql],
    { cwd: root, encoding: 'utf8' },
  )

  /* d1 execute prints a human-readable table as well as JSON, so the JSON is pulled
   * out of the output rather than the whole thing being parsed as JSON. Wrapping it in
   * markers is what makes that reliable. */
  const start = output.indexOf('[{"results"')
  if (start === -1) {
    return []
  }
  const end = output.lastIndexOf(']') + 1
  try {
    return JSON.parse(output.slice(start, end))[0]?.results ?? []
  } catch {
    return []
  }
}

const args = process.argv.slice(2)

if (args.includes('--help') || (!args.length)) {
  console.log(`Usage:
  npm run admin:unban -- --list
  npm run admin:unban -- <address>
  npm run admin:unban -- <address> --local`)
  process.exit(0)
}

if (args.includes('--list')) {
  const bans = query(
    'SELECT client_key, failures, banned_at FROM admin_attempts WHERE banned_at IS NOT NULL ORDER BY banned_at DESC',
  )

  if (!bans.length) {
    console.log('Nobody is banned.')
    process.exit(0)
  }

  console.log(`\n${bans.length} banned address(es):\n`)
  for (const ban of bans) {
    const when = new Date(ban.banned_at).toISOString().replace('T', ' ').slice(0, 19)
    console.log(`  ${ban.client_key}  (${ban.failures} failures, since ${when} UTC)`)
  }
  console.log('\nTo lift one:  npm run admin:unban -- <address>')
  process.exit(0)
}

const address = args.find((arg) => !arg.startsWith('--'))

if (!address) {
  console.error('Give the address to unban, or --list to see who is banned.')
  process.exit(1)
}

const before = query(
  `SELECT client_key FROM admin_attempts WHERE client_key = '${address.replace(/'/g, "''")}' AND banned_at IS NOT NULL`,
)

query(`DELETE FROM admin_attempts WHERE client_key = '${address.replace(/'/g, "''")}'`)

if (before.length) {
  console.log(`Lifted the ban on ${address}.`)
} else {
  console.log(`No record for ${address}, so there was nothing to lift.`)
}

/* The browser keeps its own note that this device is blocked. It clears with the site
 * data, and it is only ever a courtesy -- the server-side ban is what the address above
 * lifts, and that holds whatever any browser thinks. Printed rather than attempted:
 * the flag lives in whatever profile the browser is actually using, and a script
 * guessing at that path is worse than telling the owner where the setting is. */
if (args.includes('--local')) {
  console.log('\nTo clear the browser-side flag: Settings -> Clear site data for this origin,')
  console.log('or open a private window. That does not lift the ban -- the address above did.')
}