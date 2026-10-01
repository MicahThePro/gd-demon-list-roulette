/**
 * Builds every tagged version of the site into versions/<tag>/.
 *
 * The point is that an old version is a real build, not a zip somebody uploaded.
 * Each tag is checked out into a throwaway git worktree, built with its own
 * package.json, and its dist/ copied out. Nothing in the working tree is touched,
 * so this is safe to run mid-project -- that matters, because the alternative
 * (stash, checkout, build, checkout back) can lose uncommitted work if a step fails
 * partway.
 *
 * A worktree rather than a clone because the objects are already here: this is a
 * few seconds per version instead of a fresh network fetch each time.
 *
 * Usage:
 *   node scripts/build-versions.mjs              # every tag except the current one
 *   node scripts/build-versions.mjs v1.9 v1.8    # just these
 *   node scripts/build-versions.mjs --all        # including the current version
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const outRoot = join(root, 'versions')

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()

/* npm, located rather than assumed.
   On Windows it is npm.cmd, and on some setups the shell that launched this script
   has node on PATH without npm beside it. Resolving next to the running node binary
   finds the npm that belongs to this node, which is the one that will install a
   version's dependencies correctly. */
const npmCommand = (() => {
  const beside = join(dirname(process.execPath), process.platform === 'win32' ? 'npm.cmd' : 'npm')
  return existsSync(beside) ? beside : process.platform === 'win32' ? 'npm.cmd' : 'npm'
})()

const fail = (message) => {
  console.error(message)
  process.exit(1)
}

/* The version currently deployed, read from the changelog rather than taken as an
 * argument. It is excluded by default because it is already live at the site root,
 * and shipping a frozen copy of it under versions/ would be a second place to keep
 * current -- the two would disagree the moment a bug was fixed on the root. */
const currentVersion = () => {
  const source = execFileSync('cat', [join(root, 'src/data/changelog.js')], { encoding: 'utf8' })
  const first = source.match(/id: '([^']+)'/)
  return first ? first[1].replace('-', '.') : null
}

const isVersionTag = (name) => /^v\d+\.\d+$/.test(name)

const listTags = () =>
  git('tag', '--list')
    .split('\n')
    .filter(Boolean)
    .filter(isVersionTag)
    // Newest first, so the most recent version is built first and a failure on an
    // old one does not leave the useful half missing.
    .sort((a, b) => {
      const [amaj, amin] = a.slice(1).split('.').map(Number)
      const [bmaj, bmin] = b.slice(1).split('.').map(Number)
      return bmaj - amaj || bmin - amin
    })

const buildOne = (tag) => {
  const outDir = join(outRoot, tag)
  const worktree = join(tmpdir(), `dlr-build-${tag}`)

  // Left behind by an interrupted run. A worktree this path is already registered
  // for would make `git worktree add` fail with a message about it existing rather
  // than anything actionable.
  rmSync(worktree, { recursive: true, force: true })
  try {
    git('worktree', 'prune')
  } catch {
    // Nothing was pruned. Not a reason to stop.
  }

  console.log(`\n--- ${tag}`)
  try {
    git('worktree', 'add', '--detach', worktree, tag)
    console.log('  checked out')

    /* The old tree's own dependencies, not this one's. A v1.6 package.json asking
       for a Vite that this project no longer uses would be built wrongly by a
       shared node_modules -- and quietly, since the build would still succeed. */
    execFileSync(npmCommand, ['ci'], { cwd: worktree, stdio: 'inherit' })
    console.log('  installed')

    execFileSync(npmCommand, ['run', 'build'], { cwd: worktree, stdio: 'inherit' })

    const dist = join(worktree, 'dist')
    if (!existsSync(dist)) {
      fail(`  ${tag} produced no dist/ -- nothing to publish for this version`)
    }

    /* Replaced whole rather than merged into. A partial directory left from an
       earlier build would keep assets that this build no longer references, which
       is dead weight nobody can reach but which still costs bandwidth to store. */
    rmSync(outDir, { recursive: true, force: true })
    mkdirSync(outDir, { recursive: true })
    cpSync(dist, outDir, { recursive: true })

    /* The admin and redeem entries are moderator and sign-in tooling. They are
       built into the current site as separate entries, but an old version has no
       business serving one, and dropping them roughly halves what a version costs
       to host. */
    for (const entry of ['admin', 'redeem']) {
      rmSync(join(outDir, entry), { recursive: true, force: true })
    }

    const bytes = readdirSync(outDir).reduce((total, entry) => {
      const path = join(outDir, entry)
      const walk = (dir) =>
        readdirSync(dir).reduce((sum, child) => {
          const childPath = join(dir, child)
          return sum + (statSync(childPath).isDirectory() ? walk(childPath) : statSync(childPath).size)
        }, 0)
      return total + (statSync(path).isDirectory() ? walk(path) : statSync(path).size)
    }, 0)
    console.log(`  built -> versions/${tag} (${Math.round(bytes / 1024)} KB)`)
  } finally {
    // Always, including on failure: a registered worktree left behind makes the
    // next run of any version fail, not just this one.
    try {
      git('worktree', 'remove', '--force', worktree)
    } catch {
      rmSync(worktree, { recursive: true, force: true })
      try {
        git('worktree', 'prune')
      } catch {
        // Nothing to prune.
      }
    }
  }
}

const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log('Usage: node scripts/build-versions.mjs [v1.9 v1.8 ...] [--all]')
  process.exit(0)
}

const tags = listTags()
if (!tags.length) {
  fail('No version tags found. Create them first: git tag v1.9 <commit>')
}

const current = currentVersion()
const wanted = args.filter((arg) => isVersionTag(arg))

if (wanted.length) {
  for (const tag of wanted) {
    if (!tags.includes(tag)) {
      fail(`No tag called ${tag}. Known tags: ${tags.join(', ')}`)
    }
  }
} else if (args.includes('--all')) {
  wanted.push(...tags)
} else {
  // Everything except the live version. The tag already carries the "v", so this
  // compares against the tag rather than rebuilding one from the id.
  wanted.push(...tags.filter((tag) => tag !== current))
}

if (!wanted.length) {
  console.log(`Nothing to build: ${tags.join(', ')} are all built and v${current} is the live one.`)
  process.exit(0)
}

console.log(`Building ${wanted.length} version(s): ${wanted.join(', ')}`)
console.log(`Skipping ${current} -- that one is the live site.`)

for (const tag of wanted) {
  buildOne(tag)
}

console.log('\nDone. Commit versions/ and run `npm run deploy` to publish.')
