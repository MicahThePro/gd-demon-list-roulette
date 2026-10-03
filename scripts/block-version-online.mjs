/**
 * Blocks the online features in every frozen build under versions/.
 *
 * An old version is an archive, not a second live copy of the site. Left alone
 * it keeps talking to the same Worker as today's build, so somebody could sign in
 * and submit a run from a version whose rules are long out of date, and the
 * global leaderboards would show two clients of wildly different behaviour side
 * by side.
 *
 * This copies scripts/version-offline-shim.js next to each version's assets and
 * loads it ahead of that version's own bundle, which rejects every request to the
 * Worker before it leaves the page. The result is the generic "could not connect
 * to the server" that every screen already shows for a network failure, so no
 * version needs a special offline mode of its own. Playing runs is unaffected.
 *
 * It runs at deploy time rather than at build time (scripts/copy-versions.mjs
 * calls it) so that a version rebuilt from its tag, without the guard, still
 * cannot reach the server once published -- and so the guard never has to be
 * committed into a minified bundle by hand.
 *
 * Also called by scripts/copy-versions.mjs at deploy time, so it exports the work
 * as a function rather than only running it from the command line.
 *
 * Usage: node scripts/block-version-online.mjs [--check]
 */
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const versionsRoot = join(root, 'versions')
const shimSource = join(root, 'scripts', 'version-offline-shim.js')

/* Kept as a marker rather than matched on by content, so the check below cannot
 * be fooled by a version whose own source happened to contain the same text. */
const MARKER = 'legacy-offline-shim.js'

const TAG = /^(<!-- legacy-offline-shim.js -->)/

const shimTag = () => `<!-- ${MARKER} -->\n    <script src="./${MARKER}"></script>`

const listVersions = (root = versionsRoot) => {
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((entry) => /^v\d+\.\d+$/.test(entry))
    .sort((a, b) => {
      const [amaj, amin] = a.slice(1).split('.').map(Number)
      const [bmaj, bmin] = b.slice(1).split('.').map(Number)
      return amaj - bmaj || amin - bmin
    })
}

const read = (file) => readFileSync(file, 'utf8')

const isBlocked = (html) => html.includes(MARKER)

/**
 * Blocks the online features in every version under the given directory.
 *
 * Returns the version names it changed. Prints what it did, because the caller
 * is a deploy script whose output is the only record of what got guarded.
 */
export const guardVersions = (root = versionsRoot) => {
  if (!existsSync(shimSource)) {
    throw new Error('scripts/version-offline-shim.js is missing -- cannot guard the old versions.')
  }

  const shim = read(shimSource)
  const changed = []
  const skipped = []

  for (const version of listVersions(root)) {
    const dir = join(root, version)
    const index = join(dir, 'index.html')

    if (!existsSync(index)) {
      skipped.push(`${version} (no index.html)`)
      continue
    }

    const html = read(index)
    copyFileSync(shimSource, join(dir, MARKER))

    // Already guarded by an earlier run: the file is rewritten only if it has
    // drifted, so re-running is a no-op rather than a second copy of the tag.
    if (isBlocked(html)) {
      if (TAG.test(html) && !html.includes(shimTag())) {
        writeFileSync(index, html.replace(TAG, shimTag()))
        console.log(`${version}: refreshed the existing shim tag`)
        changed.push(version)
      } else {
        console.log(`${version}: already blocked`)
      }
      continue
    }

    /* Ahead of the version's own bundle on purpose. The app's first render can
     * already start a fetch, so a guard loaded after it would leave a race where
     * one request slipped through before the shim ran. */
    const injected = html.includes('</head>')
      ? html.replace(/^(\s*)<\/head>/m, `$1  ${shimTag()}\n$1</head>`)
      : html.replace(/<body[^>]*>/, (match) => `${match}\n    ${shimTag()}`)

    if (injected === html) {
      skipped.push(`${version} (no <head> or <body> to inject into)`)
      continue
    }

    writeFileSync(index, injected)
    console.log(`${version}: online features blocked`)
    changed.push(version)
  }

  if (skipped.length) {
    console.log(`Skipped: ${skipped.join(', ')}`)
  }
  console.log(
    changed.length
      ? `${changed.length} old version(s) can play runs, but nothing that needs the server will work.`
      : 'Every version is already blocked.',
  )

  return changed
}

/** The version names under a directory that are still able to reach the server. */
export const unguardedVersions = (root = versionsRoot) =>
  listVersions(root).filter((version) => {
    const index = join(root, version, 'index.html')
    return !existsSync(index) || !isBlocked(read(index))
  })

/* Run directly, rather than imported by copy-versions.mjs, which is the normal
 * path. Imported as a module this does nothing. */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!existsSync(shimSource)) {
    console.error('scripts/version-offline-shim.js is missing -- cannot guard the old versions.')
    process.exit(1)
  }

  if (process.argv.includes('--check')) {
    const unguarded = unguardedVersions()
    if (unguarded.length) {
      console.error(`Old versions still able to reach the server: ${unguarded.join(', ')}`)
      process.exit(1)
    }
    console.log('Every version under versions/ has the online features blocked.')
    process.exit(0)
  }

  guardVersions()
}