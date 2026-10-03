/**
 * Downloads the Challenge List index page and writes a parsed snapshot to
 * challenge-list.json.
 *
 * Only the main list (the top 100) is kept. The legacy list is skipped: most of
 * its levels have been deleted from the site, so their detail pages are gone
 * and there is no Level ID or video left to show.
 *
 * challengelist.gd sends no CORS headers, so the browser cannot fetch it
 * directly. Serving a static snapshot from the same origin avoids that
 * entirely. Re-run this when the list changes:
 *
 *   node scripts/build-challenge-list.mjs
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_URL = 'https://challengelist.gd/challenges/'
const DETAIL_URL = (id) => `https://challengelist.gd/challenges/${id}/`
const MAIN_LIST_SIZE = 100
// Be gentle: the detail pages are fetched a few at a time.
const DETAIL_CONCURRENCY = 4
const DETAIL_DELAY_MS = 120
// Videos and level ids are expected on every main-list page, so a drop here
// means the site markup changed rather than the data being sparse.
const MIN_VIDEO_COVERAGE = 0.9
const MIN_LEVEL_ID_COVERAGE = 0.8

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..')
const OUTPUT_PATHS = [
  // Served by a plain static server pointed at the project root (e.g. the
  // VS Code Live Server extension), which does not know about public/.
  path.join(PROJECT_ROOT, 'challenge-list.json'),
  // Copied into dist/ by Vite, so production builds and gh-pages get it too.
  path.join(PROJECT_ROOT, 'public', 'challenge-list.json'),
]

const ITEM_PATTERN =
  /<li class="hover white" title="#(\d+) - ([^"]*)"><a href="([^"]*)">([^<]*)<br><i>([^<]*)<\/i>/g

const stripHtmlEntities = (value = '') =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')

export const parseChallengeListHtml = (html) => {
  const seen = new Set()
  const items = []
  const pattern = new RegExp(ITEM_PATTERN.source, 'g')
  let match = pattern.exec(html)

  while (match !== null) {
    const id = Number(match[1])
    if (Number.isFinite(id) && !seen.has(id)) {
      seen.add(id)
      items.push({
        id,
        // Carried into the snapshot so the client can ask the Worker for one
        // level's details. The Worker serves its own index without any ids or
        // videos, and this snapshot is the fallback when that Worker cannot be
        // reached -- so both paths have to name a level the same way.
        listId: id,
        name: stripHtmlEntities(match[2]).trim(),
        creator: stripHtmlEntities(match[5]).trim(),
      })
    }
    match = pattern.exec(html)
  }

  items.sort((a, b) => a.id - b.id)
  return {
    main: items.filter((item) => item.id <= MAIN_LIST_SIZE),
    legacy: items.filter((item) => item.id > MAIN_LIST_SIZE),
  }
}

/**
 * The index page has no Level ID or video, so each level's detail page is
 * visited to pull them out. The list position is kept separately as `position`.
 */
export const parseChallengeDetailHtml = (html) => {
  // Markup varies slightly between pages, e.g. "Level ID: </b>" and
  // "Level ID:</b>", so allow optional whitespace and formatting.
  const levelId = html.match(/Level ID:\s*<\/b>\s*(?:<br>\s*)?(\d+)/)?.[1] ?? null
  const video = html.match(
    /data-attr-value="https:\/\/www\.youtube\.com\/embed\/([A-Za-z0-9_-]{11})"/,
  )?.[1] ?? null

  return {
    levelId: levelId ? Number(levelId) : null,
    video,
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const fetchDetail = async (item) => {
  try {
    const response = await fetch(DETAIL_URL(item.id))
    if (!response.ok) return item
    const details = parseChallengeDetailHtml(await response.text())
    return { ...item, ...details }
  } catch {
    return item
  }
}

const fetchDetails = async (items) => {
  const results = new Array(items.length)
  let cursor = 0
  let done = 0
  let failed = 0

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      const result = await fetchDetail(items[index])
      if (result.levelId == null) failed += 1
      results[index] = result
      done += 1
      if (done % 25 === 0 || done === items.length) {
        console.log(`  detail pages ${done}/${items.length} (${failed} missing a level id)`)
      }
      await wait(DETAIL_DELAY_MS)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(DETAIL_CONCURRENCY, items.length) }, () => worker()),
  )

  return results
}

const main = async () => {
  console.log(`Fetching ${SOURCE_URL} ...`)
  const response = await fetch(SOURCE_URL)

  if (!response.ok) {
    throw new Error(`Failed to fetch the Challenge List (HTTP ${response.status}).`)
  }

  const html = await response.text()
  const parsed = parseChallengeListHtml(html)

  if (!parsed.main.length) {
    throw new Error('No challenges were parsed. The site markup may have changed.')
  }

  // Only the main list is kept. The legacy levels were largely removed from
  // the site, so their detail pages no longer expose a level id or a video.
  console.log(`Fetching ${parsed.main.length} detail pages for level ids and videos ...`)
  const mainItems = await fetchDetails(parsed.main)

  const missingLevelId = mainItems.filter((item) => item.levelId == null).length
  const missingVideo = mainItems.filter((item) => !item.video).length
  const videoCoverage = (mainItems.length - missingVideo) / mainItems.length
  const levelIdCoverage = (mainItems.length - missingLevelId) / mainItems.length

  if (videoCoverage < MIN_VIDEO_COVERAGE) {
    throw new Error(
      `Only ${Math.round(videoCoverage * 100)}% of detail pages had a video. The site markup may have changed.`,
    )
  }

  if (levelIdCoverage < MIN_LEVEL_ID_COVERAGE) {
    throw new Error(
      `Only ${Math.round(levelIdCoverage * 100)}% of detail pages had a level id. The site markup may have changed.`,
    )
  }

  const snapshot = {
    source: 'challengelist',
    sourceUrl: SOURCE_URL,
    fetchedAt: new Date().toISOString(),
    count: mainItems.length,
    levels: mainItems,
  }

  const json = `${JSON.stringify(snapshot, null, 2)}\n`

  for (const outputPath of OUTPUT_PATHS) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, json, 'utf8')
    console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`)
  }

  console.log(`  levels:    ${mainItems.length}`)
  console.log(`  level ids: ${mainItems.length - missingLevelId}/${mainItems.length} (${Math.round(levelIdCoverage * 100)}%)`)
  console.log(`  videos:    ${mainItems.length - missingVideo}/${mainItems.length} (${Math.round(videoCoverage * 100)}%)`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
