/**
 * Copies the frozen old builds from versions/ into dist/ before publishing.
 *
 * `gh-pages -d dist` publishes exactly what is in dist/, and vite empties that
 * directory on every build. So the old versions have to be put back after the build
 * and before the publish, and this is that step.
 *
 * They go in under versions/ so a version's own relative asset paths still resolve
 * from dist/versions/v1.9/ -- the whole reason the site is built with a relative
 * base. A version is therefore a complete, self-contained site at that URL, and
 * moving it between directories would break it; keeping it in one place does not.
 *
 * A missing or empty versions/ is not an error. It means no old versions have been
 * built yet, and publishing the current site must not depend on that.
 */
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { guardVersions } from './block-version-online.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = join(root, 'versions')
const target = join(root, 'dist', 'versions')

if (!existsSync(source)) {
  console.log('No versions/ directory -- publishing the current site only.')
  process.exit(0)
}

const versions = readdirSync(source).filter((entry) => /^v\d+\.\d+$/.test(entry))
if (!versions.length) {
  console.log('versions/ is empty -- publishing the current site only.')
  process.exit(0)
}

// Replaced whole, so a version rebuilt or deleted upstream does not leave the
// previous copy behind to be served forever.
/* Before the copy, so the guarded index.html and its shim are what lands in
   dist/. An old version is an archive and must not be able to reach the Worker --
   see scripts/block-version-online.mjs. */
guardVersions(source)

rmSync(target, { recursive: true, force: true })
cpSync(source, target, { recursive: true })

console.log(`Copied ${versions.length} old version(s) into dist/versions: ${versions.sort().join(', ')}`)
