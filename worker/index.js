/**
 * Cloudflare Worker that serves the two list sources this app cannot fetch
 * directly from the browser, because neither upstream sends CORS headers.
 *
 *   /impossible-levels -> proxied and filtered from the Impossible Levels API
 *   /challenge-list    -> scraped and parsed from challengelist.gd into the
 *                         same shape as the build-time snapshot
 *
 * Both endpoints send Access-Control-Allow-Origin so the site can call them.
 * Every request re-reads upstream, so the counts stay current without a
 * rebuild, and cache-control keeps browsers from re-fetching on every click.
 */

const IMPOSSIBLE_LEVELS_API = 'https://api.impossiblelevels.com/api/levels'
const CHALLENGE_LIST_URL = 'https://challengelist.gd/challenges/'
const CHALLENGE_LIST_DETAIL = (id) => `https://challengelist.gd/challenges/${id}/`

// challengelist.gd only publishes a 100 level main list. The legacy list is
// deliberately ignored: most of those levels were deleted from the site, so
// their detail pages expose no level id or video any more.
const CHALLENGE_LIST_SIZE = 100

// The detail pages are fetched a few at a time to stay polite.
const DETAIL_CONCURRENCY = 4

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'Content-Type',
}

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=900',
      ...CORS_HEADERS,
    },
  })

// showcaseLink is a YouTube URL in several shapes: watch?v=ID,
// watch?app=...&v=ID, youtu.be/ID, or /embed/ID.
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

// levelId is usually a number, but some rows hold a link to the level's
// history page or the string "N/A". In those the CURRENT level is the last id
// in the string; the first is the outdated one it was fixed from. Old levels
// can have short ids, so anything from two digits up counts.
const parseLevelId = (value) => {
  if (value == null) return null
  if (Number.isInteger(value) && value > 0) return value

  const ids = String(value).match(/\b\d{2,12}\b/g)
  if (!ids || !ids.length) return null

  return Number(ids[ids.length - 1])
}

const mapImpossibleLevel = (raw) => {
  const rank = Number(raw?.rank)

  return {
    id: raw?.id ?? null,
    levelId: parseLevelId(raw?.levelId),
    rank: Number.isFinite(rank) && rank > 0 ? rank : null,
    name: typeof raw?.name === 'string' ? raw.name.trim() : '',
    creator: cleanCreator(raw?.uploader) || 'Unknown creator',
    video: getYoutubeId(raw?.showcaseLink),
    permalink: raw?.id
      ? `https://impossiblelevels.com/level/${raw.id}`
      : 'https://impossiblelevels.com',
  }
}

const buildImpossibleLevels = async () => {
  const response = await fetch(IMPOSSIBLE_LEVELS_API)
  if (!response.ok) {
    throw new Error(`Impossible Levels API returned ${response.status}`)
  }

  const payload = await response.json()
  if (!Array.isArray(payload)) {
    throw new Error('Impossible Levels API did not return a list')
  }

  // Hidden rows are the odd legacy entries, not part of the public list.
  const visible = payload.filter((row) => row?.visible === true)

  const levels = visible
    .map(mapImpossibleLevel)
    .filter((level) => level.rank != null && level.name)
    .sort((a, b) => a.rank - b.rank)

  if (!levels.length) {
    throw new Error('No visible Impossible Levels were returned')
  }

  return {
    source: 'impossiblelevels',
    siteUrl: 'https://impossiblelevels.com',
    count: levels.length,
    levels,
  }
}

const stripHtmlEntities = (value = '') =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')

const ITEM_PATTERN =
  /<li class="hover white" title="#(\d+) - ([^"]*)"><a href="([^"]*)">([^<]*)<br><i>([^<]*)<\/i>/g

const parseChallengeListIndex = (html) => {
  const seen = new Set()
  const items = []
  const pattern = new RegExp(ITEM_PATTERN.source, 'g')
  let match = pattern.exec(html)

  while (match !== null) {
    const id = Number(match[1])
    if (Number.isFinite(id) && id <= CHALLENGE_LIST_SIZE && !seen.has(id)) {
      seen.add(id)
      items.push({
        id,
        // The title attribute holds the bare name; the link text only prefixes
        // it with "#N - " on the main list, so prefer the title.
        name: stripHtmlEntities(match[2]).trim(),
        creator: stripHtmlEntities(match[5]).trim() || 'Unknown creator',
      })
    }
    match = pattern.exec(html)
  }

  items.sort((a, b) => a.id - b.id)
  return items
}

// "Level ID: </b><br>123" and "Level ID:</b><br>123" both occur, and some
// pages render no level id at all.
const parseChallengeDetail = (html) => {
  const raw = html.match(/Level ID:\s*<\/b>\s*(?:<br>\s*)?(\d+)/)?.[1]
  const levelId = raw ? Number(raw) : null

  return {
    levelId: Number.isFinite(levelId) && levelId > 0 ? levelId : null,
    video:
      html.match(
        /data-attr-value="https:\/\/www\.youtube\.com\/embed\/([A-Za-z0-9_-]{11})"/,
      )?.[1] ?? null,
  }
}

const fetchChallengeDetail = async (item) => {
  try {
    const response = await fetch(CHALLENGE_LIST_DETAIL(item.id))
    if (!response.ok) return item
    return { ...item, ...parseChallengeDetail(await response.text()) }
  } catch {
    return item
  }
}

const buildChallengeList = async () => {
  const response = await fetch(CHALLENGE_LIST_URL)
  if (!response.ok) {
    throw new Error(`Challenge List returned ${response.status}`)
  }

  const items = parseChallengeListIndex(await response.text())
  if (items.length !== CHALLENGE_LIST_SIZE) {
    throw new Error(
      `Expected ${CHALLENGE_LIST_SIZE} challenges but parsed ${items.length}. The site markup may have changed.`,
    )
  }

  // The index page carries no level id or video, so each detail page is
  // visited to pick them up.
  const levels = new Array(items.length)
  let cursor = 0

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      levels[index] = await fetchChallengeDetail(items[index])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(DETAIL_CONCURRENCY, items.length) }, () => worker()),
  )

  return {
    source: 'challengelist',
    siteUrl: CHALLENGE_LIST_URL,
    count: levels.length,
    levels,
  }
}

const ROUTES = {
  'impossible-levels': buildImpossibleLevels,
  'challenge-list': buildChallengeList,
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, { status: 405 })
    }

    const key = new URL(request.url).pathname.replace(/^\/+/, '').replace(/\.json$/, '')
    const build = ROUTES[key]

    if (!build) {
      return json({ error: 'Unknown list', available: Object.keys(ROUTES) }, { status: 404 })
    }

    try {
      const data = await build()
      return json(data)
    } catch (error) {
      return json({ error: error?.message ?? 'Failed to build list' }, { status: 502 })
    }
  },
}
