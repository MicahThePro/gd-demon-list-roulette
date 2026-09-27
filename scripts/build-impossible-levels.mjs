/**
 * Downloads the Impossible Levels List and writes a parsed snapshot to
 * impossible-levels.json.
 *
 * Only levels with `visible: true` are kept. The API returns ~2300 rows, but
 * the ~200 hidden ones are the weird legacy entries that are not part of the
 * public ranked list, so they are excluded. The visible count is also the
 * rank range, since ranks 1..N are contiguous across the visible levels.
 *
 * api.impossiblelevels.com sends no CORS headers, so the browser cannot fetch
 * it directly. Serving a static snapshot from the same origin avoids that
 * entirely. Re-run this when the list changes:
 *
 *   node scripts/build-impossible-levels.mjs
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const API_URL = 'https://api.impossiblelevels.com/api/levels'
const SITE_URL = 'https://impossiblelevels.com'
const DETAIL_URL = (id) => `${SITE_URL}/level/${id}`

// The visible list is expected to be in this ballpark. A much larger number
// means hidden/legacy rows leaked in, which is what we are filtering out.
const EXPECTED_VISIBLE_COUNT = 2116
const COUNT_TOLERANCE = 0.1

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..')
const OUTPUT_PATHS = [
  // Served by a plain static server pointed at the project root (e.g. the
  // VS Code Live Server extension), which does not know about public/.
  path.join(PROJECT_ROOT, 'impossible-levels.json'),
  // Copied into dist/ by Vite, so production builds and gh-pages get it too.
  path.join(PROJECT_ROOT, 'public', 'impossible-levels.json'),
]

// showcaseLink is a YouTube URL in a few shapes: watch?v=ID, watch?app=...&v=ID,
// youtu.be/ID, or /embed/ID.
const getYoutubeId = (url) => {
  if (!url) return null
  const value = String(url)
  const short = value.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)
  if (short) return short[1]
  const watch = value.match(/[?&]v=([A-Za-z0-9_-]{11})/)
  if (watch) return watch[1]
  const embed = value.match(/\/embed\/([A-Za-z0-9_-]{11})/)
  return embed ? embed[1] : null
}

const cleanCreator = (value) => {
  if (typeof value !== 'string') return ''
  const trimmed = value.replace(/^@/, '').trim()
  return !trimmed || trimmed.toLowerCase() === 'n/a' ? '' : trimmed
}

// levelId is usually a number, but some entries instead hold a link to the
// level's history page or the string "N/A". Those forms can be resolved:
//   history.geometrydash.eu/level/<oldId>/<newId>/down  -> the new id
//   "<id>  (Fix: <newId>)"                                 -> the fixed id
// In both cases the current level is the LAST id in the string; the first is
// the outdated one the level was fixed from. Old levels can have short ids, so
// anything from 2 digits up counts.
const parseLevelId = (value) => {
  if (value == null) return null
  if (Number.isInteger(value) && value > 0) return value

  const text = String(value)
  const ids = text.match(/\b\d{2,12}\b/g)
  if (!ids || !ids.length) return null

  return Number(ids[ids.length - 1])
}

export const mapImpossibleLevel = (raw) => {
  const rank = Number(raw?.rank)
  const video = getYoutubeId(raw?.showcaseLink)

  return {
    id: raw?.id ?? null,
    levelId: parseLevelId(raw?.levelId),
    rank: Number.isFinite(rank) && rank > 0 ? rank : null,
    name: typeof raw?.name === 'string' ? raw.name.trim() : '',
    creator: cleanCreator(raw?.uploader) || 'Unknown creator',
    video,
    permalink: raw?.id ? DETAIL_URL(raw.id) : SITE_URL,
  }
}

const main = async () => {
  console.log(`Fetching ${API_URL} ...`)
  const response = await fetch(API_URL)

  if (!response.ok) {
    throw new Error(`Failed to fetch the Impossible Levels List (HTTP ${response.status}).`)
  }

  const payload = await response.json()
  if (!Array.isArray(payload)) {
    throw new Error('The Impossible Levels List API did not return a list.')
  }

  // Hidden rows are the odd legacy levels, so keep only visible ones.
  const visible = payload.filter((row) => row?.visible === true)
  const hidden = payload.length - visible.length

  if (!visible.length) {
    throw new Error('No visible levels were returned. The API shape may have changed.')
  }

  const levels = visible
    .map(mapImpossibleLevel)
    .filter((level) => level.rank != null && level.name)
    .sort((a, b) => a.rank - b.rank)

  if (levels.length !== visible.length) {
    throw new Error(
      `Only ${levels.length} of ${visible.length} visible levels had a usable rank and name. The API shape may have changed.`,
    )
  }

  // Guard against the hidden legacy rows creeping back in.
  const drift = Math.abs(levels.length - EXPECTED_VISIBLE_COUNT) / EXPECTED_VISIBLE_COUNT
  if (drift > COUNT_TOLERANCE) {
    throw new Error(
      `Expected about ${EXPECTED_VISIBLE_COUNT} visible levels but got ${levels.length}. ` +
        'The list may have changed substantially, or the visible filter may no longer exclude the legacy levels.',
    )
  }

  const missingVideo = levels.filter((level) => !level.video).length
  const missingLevelId = levels.filter((level) => level.levelId == null).length
  const maxRank = levels[levels.length - 1].rank
  if (levels[0].rank !== 1 || maxRank !== levels.length) {
    throw new Error(
      `Ranks are not a contiguous 1..${levels.length} run (got ${levels[0].rank}..${maxRank}).`,
    )
  }

  const snapshot = {
    source: 'impossiblelevels',
    sourceUrl: API_URL,
    siteUrl: SITE_URL,
    fetchedAt: new Date().toISOString(),
    count: levels.length,
    hiddenExcluded: hidden,
    levels,
  }

  const json = `${JSON.stringify(snapshot, null, 2)}\n`

  for (const outputPath of OUTPUT_PATHS) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, json, 'utf8')
    console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`)
  }

  console.log(`  levels:         ${levels.length}`)
  console.log(`  hidden skipped: ${hidden}`)
  console.log(`  with video:     ${levels.length - missingVideo}/${levels.length}`)
  console.log(`  with level id:  ${levels.length - missingLevelId}/${levels.length}`)
  console.log(`  top level:      #${levels[0].rank} ${levels[0].name} by ${levels[0].creator}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
