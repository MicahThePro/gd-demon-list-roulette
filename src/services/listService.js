import { censorText } from '../utils/censor'
import {
  DEFAULT_POINTERCRATE_PARTS,
  normalizePointercrateParts,
  pointercratePartRanges,
} from './pointercrateParts.js'

const POINTERCRATE_URL = import.meta.env.PROD
  ? 'https://pointercrate.com'
  : '/api/pointercrate'
const AREDL_URL = 'https://api.aredl.net/v2/api/aredl'
const GSL_URL = import.meta.env.PROD
  ? 'https://globalshittylist.com/api/levels'
  : '/api/gsl/levels'
const GSL_LIST_TYPE = 'classic'
const GSL_PAGE_SIZE = 500
const GSL_MAX_PAGES = 20
// challengelist.gd sends no CORS headers, so the browser cannot fetch it.
// A Cloudflare Worker re-serves it with CORS enabled, which means the list is
// read live on every page load instead of from a frozen build-time file. The
// build-time snapshots are kept as a fallback, so the app still works if the
// Worker is unreachable. Paths are relative to Vite's base so they resolve
// when the app is deployed under a subpath, such as GitHub Pages at /<repo>/.
const withBase = (filePath) => `${import.meta.env.BASE_URL}${filePath}`.replace(/\/{2,}/g, '/')
const LIST_WORKER_URL = 'https://demon-roulette-list-proxy.micah-nordlund.workers.dev'
const CHALLENGE_LIST_URLS = [
  `${LIST_WORKER_URL}/challenge-list`,
  withBase('challenge-list.json'),
  './challenge-list.json',
  withBase('public/challenge-list.json'),
  withBase('dist/challenge-list.json'),
]
// api.impossiblelevels.com sends no CORS headers either, so the same Worker
// proxies it. Only visible levels are included, which excludes the hidden
// legacy entries.
// The Worker is the primary source for both lists: it re-reads upstream on
// every request, so counts and levels stay current with no rebuild. The
// build-time snapshots are only a fallback for when the Worker is unreachable.
const IMPOSSIBLE_LEVELS_URLS = [
  `${LIST_WORKER_URL}/impossible-levels`,
  withBase('impossible-levels.json'),
  './impossible-levels.json',
  withBase('public/impossible-levels.json'),
  withBase('dist/impossible-levels.json'),
]
/* The display name of every list the site can play, in one place.
 *
 * This string is not cosmetic: it is stored on each run as `source`, and it is
 * what the global leaderboard groups and filters by. Anything that decides
 * whether a run is submittable has to compare against exactly these values, so
 * they are defined once here and derived everywhere else. They used to be
 * retyped in two other files, and AREDL drifted: the loader produced 'AREDL'
 * while the submission check and the global board's list filter expected
 * 'All Rated Extreme Demons List', so an AREDL run could be played but never
 * submitted, and never shown under its own list.
 *
 * The short labels below are for the buttons; the names are for the data. */
export const LIST_SOURCES = {
  POINTERCRATE: 'Pointercrate Demon List',
  AREDL: 'AREDL',
  GSL: 'Global Shitty List',
  CHALLENGE: 'Challenge List',
  IMPOSSIBLE: 'Impossible Levels List',
}

/** Short labels for the list buttons, keyed by the same display names. */
export const LIST_SOURCE_LABELS = {
  [LIST_SOURCES.POINTERCRATE]: 'Pointercrate',
  [LIST_SOURCES.AREDL]: 'AREDL',
  [LIST_SOURCES.GSL]: 'GSL',
  [LIST_SOURCES.CHALLENGE]: 'Challenge List',
  [LIST_SOURCES.IMPOSSIBLE]: 'Impossible Levels',
}

const IMPOSSIBLE_LEVELS_NAME = LIST_SOURCES.IMPOSSIBLE
const IMPOSSIBLE_LEVELS_SIZE = 2116
const CHALLENGE_LIST_MAIN_SIZE = 100
const AREDL_MAX_RETRIES = 5

const wait = (delayMs) => new Promise((resolve) => globalThis.setTimeout(resolve, delayMs))

const getYoutubeId = (videoUrl) => {
  if (!videoUrl) return null

  const match = videoUrl.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return match ? match[1] : null
}

const extractAredlCreator = (level) => {
  const candidates = [
    level?.publisher?.global_name,
    level?.publisher?.name,
    level?.publisher?.username,
    level?.creator,
    level?.creator_name,
    level?.publisher_name,
    level?.user?.global_name,
    level?.user?.name,
    level?.user?.username,
    level?.verifier?.name,
    level?.verifier?.global_name,
    level?.author?.name,
    level?.author?.username,
  ]

  const first = candidates.find((value) => typeof value === 'string' && value.trim())
  return first ? first.trim() : 'Unknown creator'
}

const extractAredlVideoUrl = (level) => {
  const candidates = [
    level?.video_url,
    level?.video,
    level?.videoUrl,
    level?.youtube_url,
    level?.youtube,
    level?.verifications,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }

    if (Array.isArray(candidate)) {
      const result = candidate.find((entry) => typeof entry?.video_url === 'string' && entry.video_url.trim())
      if (result) {
        return result.video_url.trim()
      }
    }
  }

  return null
}

const parsePositiveInteger = (value, fallback = null) => {
  if (value === '' || value === null || value === undefined) {
    return fallback
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback
  }

  return parsed
}

export const normalizeListRequest = ({ source = 'pointercrate', start, end, pointercrateParts } = {}) => {
  const resolvedSource =
    source === 'aredl'
      ? 'aredl'
      : source === 'gsl'
        ? 'gsl'
        : source === 'challengelist'
          ? 'challengelist'
          : source === 'impossiblelevels'
            ? 'impossiblelevels'
            : 'pointercrate'
  const normalizedStart = parsePositiveInteger(start)
  const normalizedEnd = parsePositiveInteger(end)
  /* Normalized once here, on the way in, so every source below carries a valid
   * selection whatever the caller passed -- including the Pointercrate branch,
   * which is the one that actually reads it. It used to be added only to the
   * rankable sources' return, so Pointercrate fell through to the plain return
   * below with no `pointercrateParts` on it at all. That read as undefined and
   * normalized back to the default, so ticking Legacy appeared to do nothing:
   * the draw was Main and Extended whichever box was on. */
  const parts = normalizePointercrateParts(pointercrateParts)

  if (
    resolvedSource === 'aredl' ||
    resolvedSource === 'gsl' ||
    resolvedSource === 'challengelist' ||
    resolvedSource === 'impossiblelevels'
  ) {
    const safeStart = normalizedStart ?? 1
    const safeEnd = normalizedEnd ?? 150
    const sourceName =
      resolvedSource === 'gsl'
        ? LIST_SOURCES.GSL
        : resolvedSource === 'challengelist'
          ? LIST_SOURCES.CHALLENGE
          : resolvedSource === 'impossiblelevels'
            ? IMPOSSIBLE_LEVELS_NAME
            : 'AREDL'
    if (safeStart > safeEnd) {
      throw new Error(`${sourceName} start must be less than or equal to the end value.`)
    }
    return {
      source: resolvedSource,
      start: safeStart,
      end: safeEnd,
      pointercrateParts: parts,
    }
  }
  return {
    source: resolvedSource,
    start: normalizedStart,
    end: normalizedEnd,
    pointercrateParts: parts,
  }
}

/** The API caps `limit` at 100, so the 702 demons take eight requests. */
const POINTERCRATE_PAGE_SIZE = 100
/* A hard stop, so a malformed or never-ending sequence cannot page forever.
 * Above the 702 the site actually publishes, with room to grow. */
const POINTERCRATE_MAX_PAGES = 20

/**
 * The whole Pointercrate sequence, paged.
 *
 * The three lists the site offers are three slices of one ranked sequence, and
 * this is that sequence. Only Main was ever read before, and only its first 150,
 * so the extended and legacy demons were unreachable however the site was
 * configured. Reading the whole thing once and slicing it locally is what makes
 * the part selection possible at all.
 *
 * `after` is the position to resume from, so a page that comes back empty is the
 * end of the list rather than a failure -- which is how the loop below knows to
 * stop.
 */
const fetchPointercrateSequence = async () => {
  const rows = []
  let after = 0

  for (let page = 0; page < POINTERCRATE_MAX_PAGES; page += 1) {
    const url = `${POINTERCRATE_URL}/api/v2/demons/listed/?limit=${POINTERCRATE_PAGE_SIZE}&after=${after}`
    const response = await fetch(url)
    if (!response.ok) {
      /* A first page that fails is fatal: there is nothing to draw from and the
       * error is worth showing. A later page that fails leaves a short list,
       * which still plays, so it is better than refusing the whole run -- but it
       * says so rather than quietly handing back a truncated list as if it were
       * the real thing. */
      if (!rows.length) {
        throw new Error('Failed to load the Pointercrate demon list.')
      }
      break
    }

    const payload = await response.json()
    if (!Array.isArray(payload) || !payload.length) break

    rows.push(...payload)
    after = Number(payload[payload.length - 1]?.position ?? after)

    if (payload.length < POINTERCRATE_PAGE_SIZE) break
  }

  return rows
}

const fetchPointercrateList = async (parts = DEFAULT_POINTERCRATE_PARTS) => {
  const rows = await fetchPointercrateSequence()
  if (!rows.length) {
    throw new Error('Pointercrate data could not be parsed.')
  }

  const allLevels = rows.map(mapPointercrateDemonToLevel)
  const highestPosition = Math.max(...allLevels.map((level) => Number(level.position) || 0))

  /* The ranges the ticked parts cover, clipped to what actually loaded and with
   * any overlap removed, so a demon cannot be drawn twice because two of the
   * ticked lists both contain it. */
  const ranges = pointercratePartRanges(parts, highestPosition)

  const finalLevels = allLevels.filter((level) => {
    const position = Number(level.position)
    return ranges.some((range) => position >= range.from && position <= range.to)
  })

  if (!finalLevels.length) {
    throw new Error('No Pointercrate demons were found for the lists you picked.')
  }

  return {
    source: 'pointercrate',
    sourceTitle: LIST_SOURCES.POINTERCRATE,
    /* The parts this response was actually drawn from, not the ones asked for.
     * The ranges are clipped to what loaded, so a part that ran past the end of
     * the list could have been narrowed -- and the badge has to say what the run
     * was really played from. */
    pointercrateParts: ranges.map((range) => range.id),
    count: finalLevels.length,
    totalCount: allLevels.length,
    /* Every demon in the ticked parts, not a capped slice.
     *
     * There used to be a `slice(0, 150)` here, which was the whole of the main
     * list and so looked harmless. It stopped being harmless the moment the list
     * could hold more than that: someone ticking only Legacy would have been
     * handed the first 150 of 552 for no stated reason, which reads as a bug
     * rather than a rule. Ticking a list now means all of it. */
    levels: finalLevels,
  }
}

const mapPointercrateDemonToLevel = (demon) => {
  const videoId = getYoutubeId(demon.video)
  const thumbnail = demon.thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : null)

  return {
    id: demon.id,
    levelId: demon.level_id ?? demon.id,
    position: demon.position,
    name: demon.name,
    creator: demon.publisher?.name || demon.verifier?.name || 'Unknown creator',
    video: videoId,
    thumbnail,
    permalink: `https://pointercrate.com/demonlist/permalink/${demon.id}/`,
    detailUrl: `https://pointercrate.com/demonlist/permalink/${demon.id}/`,
  }
}

export const filterLevelsByRange = (levels = [], start = null, end = null) => {
  if (!Array.isArray(levels) || !levels.length) {
    return []
  }

  const safeStart = start ?? 1
  const safeEnd = end ?? Number.MAX_SAFE_INTEGER

  return levels.filter((level) => {
    const position = Number(level?.position)
    return Number.isFinite(position) && position >= safeStart && position <= safeEnd
  })
}

export const getAredlListBounds = (levels = []) => {
  if (!Array.isArray(levels) || !levels.length) {
    return { start: 1, end: 150 }
  }

  const positions = levels
    .map((level) => Number(level?.position))
    .filter((value) => Number.isFinite(value) && value > 0)

  if (!positions.length) {
    return { start: 1, end: 150 }
  }

  return {
    start: 1,
    end: Math.max(...positions),
  }
}

const mapAredlLevelToLevel = (level) => {
  const videoUrl = extractAredlVideoUrl(level)
  const videoId = getYoutubeId(videoUrl)
  const thumbnail = videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : null

  return {
    id: level?.level_id ?? level?.id ?? 0,
    levelId: level?.level_id ?? level?.id ?? 0,
    position: level?.position ?? null,
    name: level?.name ?? 'Unknown level',
    creator: extractAredlCreator(level),
    video: videoId,
    thumbnail,
    permalink: `https://aredl.net/list/${level?.level_id ?? level?.id ?? 0}`,
    detailUrl: `https://aredl.net/list/${level?.level_id ?? level?.id ?? 0}`,
  }
}

export const mapAredlDetailToLevel = (level) => {
  const videoUrl = extractAredlVideoUrl(level)
  const videoId = getYoutubeId(videoUrl)
  const thumbnail = videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : null

  return {
    id: level?.level_id ?? level?.id ?? 0,
    levelId: level?.level_id ?? level?.id ?? 0,
    position: level?.position ?? null,
    name: level?.name ?? 'Unknown level',
    creator: extractAredlCreator(level),
    video: videoId,
    thumbnail,
    permalink: `https://aredl.net/list/${level?.level_id ?? level?.id ?? 0}`,
    detailUrl: `https://aredl.net/list/${level?.level_id ?? level?.id ?? 0}`,
  }
}

export const fetchAredlLevelDetails = async (level, fetcher = fetch) => {
  const levelId = level?.levelId ?? level?.id
  if (!levelId) {
    return level
  }

  let attempt = 0

  while (attempt < AREDL_MAX_RETRIES) {
    try {
      const levelResponse = await fetcher(`${AREDL_URL}/levels/${levelId}`)

      if (levelResponse?.status === 429) {
        attempt += 1
        if (attempt >= AREDL_MAX_RETRIES) {
          return level
        }

        await wait(1000 * attempt)
        continue
      }

      if (!levelResponse?.ok) {
        return level
      }

      const detailPayload = await levelResponse.json()
      return mapAredlDetailToLevel(detailPayload)
    } catch {
      attempt += 1
      if (attempt >= AREDL_MAX_RETRIES) {
        return level
      }

      await wait(1000 * attempt)
    }
  }

  return level
}

export const fetchAredlListBounds = async (fetcher = fetch) => {
  const response = await fetcher(`${AREDL_URL}/levels?exclude_pending=true&exclude_removed=true&exclude_legacy=true`)

  if (!response?.ok) {
    return { start: 1, end: 150 }
  }

  const payload = await response.json()
  const rawLevels = Array.isArray(payload) ? payload : []
  return getAredlListBounds(rawLevels)
}

const fetchAredlList = async ({ start, end } = {}) => {
  const response = await fetch(`${AREDL_URL}/levels?exclude_pending=true&exclude_removed=true&exclude_legacy=true`)

  if (!response.ok) {
    throw new Error('Failed to load the AREDL list.')
  }

  const payload = await response.json()
  const rawLevels = Array.isArray(payload) ? payload : []
  const listView = rawLevels.map(mapAredlLevelToLevel).filter((level) => Number.isFinite(Number(level.position)))
  const filteredLevels = filterLevelsByRange(listView, start, end)

  if (!filteredLevels.length) {
    throw new Error('No AREDL levels were found for that range.')
  }

  return {
    source: 'aredl',
    sourceTitle: LIST_SOURCES.AREDL,
    count: filteredLevels.length,
    levels: filteredLevels,
  }
}

const extractGslCreator = (level) => {
  const author = typeof level?.author === 'string' ? level.author.trim() : ''
  const verifier = typeof level?.verifier === 'string' ? level.verifier.trim() : ''
  return author || verifier || 'Unknown creator'
}
export const mapGslLevelToLevel = (level) => {
  const videoId = getYoutubeId(level?.youtube)
  const levelId = level?.levelId ?? level?.id ?? 0
  const rank = Number(level?.rank)
  return {
    id: level?.id ?? `gsl-${levelId}`,
    levelId,
    position: Number.isFinite(rank) ? rank : null,
    name: level?.name ?? 'Unknown level',
    creator: extractGslCreator(level),
    video: videoId,
    thumbnail: videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : null,
    permalink: `https://gdbrowser.com/${levelId}`,
    detailUrl: `https://gdbrowser.com/${levelId}`,
  }
}
const fetchGslPage = async (offset, fetcher, limit = GSL_PAGE_SIZE) => {
  const url = `${GSL_URL}?list=${GSL_LIST_TYPE}&limit=${limit}&offset=${offset}`
  const response = await fetcher(url)
  if (!response?.ok) {
    throw new Error(censorText(`Failed to load the ${LIST_SOURCES.GSL}.`))
  }
  const payload = await response.json()
  if (!payload?.ok) {
    throw new Error(censorText(`Failed to load the ${LIST_SOURCES.GSL}.`))
  }
  const rows = Array.isArray(payload?.data) ? payload.data : []
  return {
    rows,
    hasMore: payload?.meta?.hasMore === true,
    total: Number(payload?.meta?.total) || 0,
  }
}
export const fetchGslListBounds = async (fetcher = fetch) => {
  try {
    // Only the total is needed here. Asking for a single row returns the same
    // meta.total in a fraction of a kilobyte, instead of downloading a full
    // page of levels just to count them.
    const { total } = await fetchGslPage(0, fetcher, 1)
    if (Number.isFinite(total) && total > 0) {
      return { start: 1, end: total }
    }
    return { start: 1, end: 150 }
  } catch {
    return { start: 1, end: 150 }
  }
}
// The GSL ranks are sequential from 1, so the API's offset maps straight onto
// rank - 1. That means a rank range can be fetched directly instead of paging
// through the whole list and discarding most of it.
const fetchGslRange = async ({ start, end } = {}, fetcher = fetch) => {
  const from = Math.max(1, parsePositiveInteger(start) ?? 1)
  const to = parsePositiveInteger(end) ?? Number.MAX_SAFE_INTEGER
  const rows = []
  let offset = from - 1

  for (let page = 0; page < GSL_MAX_PAGES; page += 1) {
    // Never ask for more than the remaining span of the range.
    const remaining = to === Number.MAX_SAFE_INTEGER ? GSL_PAGE_SIZE : to - offset
    const limit = Math.min(GSL_PAGE_SIZE, Math.max(1, remaining))
    const result = await fetchGslPage(offset, fetcher, limit)
    rows.push(...result.rows)
    if (!result.hasMore || result.rows.length === 0 || result.rows.length < limit) {
      break
    }
    offset += result.rows.length
  }

  return rows
}

const fetchGslList = async ({ start, end } = {}, fetcher = fetch) => {
  const rawLevels = await fetchGslRange({ start, end }, fetcher)
  if (!rawLevels.length) {
    throw new Error(censorText(`${LIST_SOURCES.GSL} data could not be parsed.`))
  }
  const listView = rawLevels.map(mapGslLevelToLevel)
  const uniqueLevels = Array.from(new Map(listView.map((level) => [level.id, level])).values())
  const filteredLevels = filterLevelsByRange(uniqueLevels, start, end)
  if (!filteredLevels.length) {
    throw new Error(censorText(`No ${LIST_SOURCES.GSL} levels were found for that range.`))
  }
  return {
    source: 'gsl',
    sourceTitle: LIST_SOURCES.GSL,
    count: filteredLevels.length,
    totalCount: uniqueLevels.length,
    levels: filteredLevels,
  }
}
// challengelist.gd is a server-rendered site with no JSON API, so the lists are
// snapshotted at build time into public/challenge-list.json (see
// scripts/build-challenge-list.mjs) and read from our own origin here.
// `position` is the slot on the combined list, `levelId` is the real Geometry
// Dash level id, and the video comes from the level's detail page.
const toChallengeListLevel = (item, position) => ({
  id: `challengelist-${item.id}`,
  // The upstream challenge number. The Worker serves the index without any level
  // ids or videos -- fetching those means visiting 100 detail pages, which is one
  // too many subrequests for a single Worker invocation and used to fail past the
  // first 49 -- so they are fetched per level, and this is what that request asks
  // for. Kept because a run's levels are stored in localStorage and replayed long
  // after the list response that carried it.
  listId: item.id ?? null,
  levelId: item.levelId ?? null,
  position,
  name: item.name || `Challenge #${item.id}`,
  creator: item.creator || 'Unknown creator',
  video: item.video || null,
  thumbnail: item.video ? `https://i.ytimg.com/vi/${item.video}/mqdefault.jpg` : null,
  permalink: `https://challengelist.gd/challenges/${item.id}/`,
  detailUrl: `https://challengelist.gd/challenges/${item.id}/`,
})

// Accepts both shapes: the { levels: [...] } snapshot and a bare array, so a
// plain proxy response is usable without a separate mapping step.
const readSnapshotLevels = (payload) => {
  if (Array.isArray(payload)) {
    // A bare array is the raw upstream API, which also carries the hidden
    // legacy rows. Drop those so the count matches the public list.
    return payload.filter((row) => row?.visible !== false)
  }
  if (Array.isArray(payload?.levels)) {
    return payload.levels
  }
  return []
}

const fetchChallengeListSnapshot = async (fetcher = fetch) => {
  for (const url of CHALLENGE_LIST_URLS) {
    try {
      const response = await fetcher(url)
      if (!response?.ok) {
        continue
      }

        const snapshot = await response.json()
        const levels = readSnapshotLevels(snapshot).filter(
          (row) => row && (row.rank ?? row.position ?? row.id) != null,
        )

        if (!levels.length) {
          continue
        }

        return { levels }
      } catch {
      // Try the next candidate path.
    }
  }

  throw new Error('Failed to load the Challenge List. Run "npm run update:challenge-list".')
}

/**
 * The level id and video for one Challenge List entry, from the Worker.
 *
 * Neither is derivable from the list: challengelist.gd shows them only on each
 * challenge's own page. That is one request for the level on screen, and the
 * Worker caches the answer at the edge for a week, so it costs nothing after the
 * first player to reach that level.
 *
 * Returns nulls when it cannot be reached or the page has no id, so the caller
 * simply renders as it did before rather than handling an error -- a level with
 * no id is still playable, it just falls back to its permalink.
 */
export const fetchChallengeLevelDetails = async (listId, fetcher = fetch) => {
  if (listId == null) return { levelId: null, video: null }

  try {
    const response = await fetcher(
      `${LIST_WORKER_URL}/challenge-list-detail?id=${encodeURIComponent(listId)}`,
    )
    if (!response?.ok) return { levelId: null, video: null }

    const data = await response.json()
    return {
      levelId: Number.isFinite(Number(data?.levelId)) && Number(data.levelId) > 0
        ? Number(data.levelId)
        : null,
      video: typeof data?.video === 'string' && data.video ? data.video : null,
    }
  } catch {
    return { levelId: null, video: null }
  }
}

export const fetchChallengeListBounds = async (fetcher = fetch) => {
  try {
    const parsed = await fetchChallengeListSnapshot(fetcher)
    return { end: Math.max(1, parsed.levels.length) }
  } catch {
    return { end: CHALLENGE_LIST_MAIN_SIZE }
  }
}

export const fetchChallengeList = async ({ start, end } = {}, fetcher = fetch) => {
  const parsed = await fetchChallengeListSnapshot(fetcher)
  const filtered = filterLevelsByRange(
    parsed.levels.map((item, index) => toChallengeListLevel(item, index + 1)),
    start,
    end,
  )

  if (!filtered.length) {
    throw new Error('No Challenge List levels were found for that range.')
  }

  return {
    source: 'challengelist',
    sourceTitle: LIST_SOURCES.CHALLENGE,
    count: filtered.length,
    totalCount: parsed.levels.length,
    levels: filtered,
  }
}

// levelId is usually a number, but a raw API row can hold a link to the
// level's history page or the string "N/A". In those the CURRENT level is the
// last id in the string; the first is the outdated one it was fixed from.
const parseSnapshotLevelId = (value) => {
  if (value == null || Number.isInteger(value)) {
    return value ?? null
  }
  const ids = String(value).match(/\b\d{2,12}\b/g)
  return ids && ids.length ? Number(ids[ids.length - 1]) : null
}

// A raw API row keeps the source field names, a parsed snapshot uses mapped
// ones. Accept either so a plain proxy response works without extra mapping.
const toImpossibleLevel = (item) => {
  const rank = item?.rank ?? item?.position ?? null
  const name = item?.name ?? ''
  const creator = item?.creator ?? item?.uploader ?? 'Unknown creator'
  const video = item?.video ?? getYoutubeId(item?.showcaseLink)
  const levelId = parseSnapshotLevelId(item?.levelId)
  const permalink = item?.permalink || 'https://impossiblelevels.com'
  // Only present in the build-time snapshot. The live Worker cannot supply
  // these in the list response, because the site reveals the unit (TPS or FPS)
  // and the version tag only on each level's own page, and neither is
  // derivable from the list fields. fetchImpossibleLevelDetails asks the
  // Worker for the level on screen.
  const rate = typeof item?.rate === 'string' && item.rate.trim() ? item.rate.trim() : null
  const version =
    typeof item?.version === 'string' && item.version.trim() ? item.version.trim() : null

  return {
    id: `impossiblelevels-${item?.id ?? rank}`,
    // The upstream id, kept because the rate and version are looked up per
    // level by this id. It is stripped from the run history, which only keeps
    // the display fields, so it costs nothing in the cookie.
    listId: item?.id ?? null,
    levelId,
    position: Number.isFinite(Number(rank)) ? Number(rank) : null,
    name: name || `Impossible level #${rank}`,
    creator: creator || 'Unknown creator',
    video: video || null,
    thumbnail: video ? `https://i.ytimg.com/vi/${video}/mqdefault.jpg` : null,
    permalink,
    detailUrl: permalink,
    rate,
    version,
  }
}

/**
 * The required rate and game version for one Impossible Levels entry, from the
 * Worker.
 *
 * Neither is derivable from the list data: the site labels a level TPS only when
 * it carries the 2.2 tag, so the same rate shows up as both TPS and FPS across
 * the list, and its versionPossible field is free text that disagrees with the
 * rendered version tag. Both are therefore read from the level's own page,
 * which the Worker caches at the edge for a day, so this costs one request the
 * first time a given level is played and none after that.
 *
 * Returns nulls when the level has no rate or no version (most have neither a
 * version nor, rarely, a rate), and also when the Worker cannot be reached, so
 * the caller can simply not render a badge rather than handling an error.
 */
export const fetchImpossibleLevelDetails = async (levelId, fetcher = fetch) => {
  const empty = { rate: null, version: null }
  if (levelId == null) return empty

  try {
    const response = await fetcher(
      `${LIST_WORKER_URL}/impossible-level-rate?id=${encodeURIComponent(levelId)}`,
    )
    if (!response?.ok) return empty

    const data = await response.json()
    const clean = (value) =>
      typeof value === 'string' && value.trim() ? value.trim() : null

    return { rate: clean(data?.rate), version: clean(data?.version) }
  } catch {
    return empty
  }
}

const fetchImpossibleLevelsSnapshot = async (fetcher = fetch) => {
  for (const url of IMPOSSIBLE_LEVELS_URLS) {
    try {
      const response = await fetcher(url)
      if (!response?.ok) {
        continue
      }

      const levels = readSnapshotLevels(await response.json()).filter(
        (row) => row && (row.rank ?? row.position) != null,
      )

      if (!levels.length) {
        continue
      }

      return { levels }
    } catch {
      // Try the next candidate path.
    }
  }

  throw new Error(`Failed to load the ${IMPOSSIBLE_LEVELS_NAME}. Run "npm run update:impossible-levels".`)
}

export const fetchImpossibleLevels = async ({ start, end } = {}, fetcher = fetch) => {
  const parsed = await fetchImpossibleLevelsSnapshot(fetcher)
  const filtered = filterLevelsByRange(
    parsed.levels.map(toImpossibleLevel),
    start,
    end,
  )

  if (!filtered.length) {
    throw new Error(`No ${IMPOSSIBLE_LEVELS_NAME} entries were found for that range.`)
  }

  return {
    source: 'impossiblelevels',
    sourceTitle: IMPOSSIBLE_LEVELS_NAME,
    count: filtered.length,
    totalCount: parsed.levels.length,
    levels: filtered,
  }
}

export const fetchImpossibleLevelsBounds = async (fetcher = fetch) => {
  try {
    const parsed = await fetchImpossibleLevelsSnapshot(fetcher)
    return { end: Math.max(1, parsed.levels.length) }
  } catch {
    return { end: IMPOSSIBLE_LEVELS_SIZE }
  }
}

/* The one place every level passes through on its way into the app.
 *
 * The level name is left exactly as it arrived.
 *
 * It used to be masked here. That was sound reasoning for the case it was written
 * for -- this is the single point all five loaders converge on, so masking in each
 * of them would be five chances to forget one, and masking at the source would mean
 * masking upstream text the Worker does not control either.
 *
 * But it made the mask irreversible. Once the real name had been overwritten here
 * there was nothing left for a player who opted out of the mask to read, so the
 * setting could switch the mask off everywhere except level names -- which is most of
 * what a player ever sees. A toggle that cannot un-mask the main thing people look at
 * is not a toggle.
 *
 * So the name is kept verbatim and masked where it is read, by `censorText` in the
 * component that shows it. Every place a level name reaches the screen already calls
 * that function, and the render tests check both halves: that the load leaves the
 * name alone, and that the screen still masks it.
 *
 * This is also what the note at the top of censor.js has always described.
 *
 * `sourceTitle` is likewise left alone, for the same reason and a stronger one: it is
 * the stored identity of every run played on the list, so it has to reach the Worker
 * exactly as the Worker knows it, and is masked at render like any other name.
 *
 * The payload shape is unchanged either way. The level id, video, rank and thumbnail
 * are what the rest of the app uses to identify and play a level, and none of them are
 * ever masked: that would be a different function from this one, since this is about
 * what a player reads rather than what the app looks a level up by.
 */
const censorLevels = (payload) => ({
  ...payload,
  levels: (payload?.levels ?? []).map((level) =>
    level && typeof level === 'object' ? { ...level } : level,
  ),
})

export { DEFAULT_POINTERCRATE_PARTS, normalizePointercrateParts }

export const fetchList = async (request = {}) => {
  const normalizedRequest = normalizeListRequest(request)
  if (normalizedRequest.source === 'aredl') {
    return censorLevels(await fetchAredlList(normalizedRequest))
  }
  if (normalizedRequest.source === 'gsl') {
    return censorLevels(await fetchGslList(normalizedRequest))
  }
  if (normalizedRequest.source === 'impossiblelevels') {
    return censorLevels(
      await fetchImpossibleLevels({
        start: normalizedRequest.start ?? 1,
        end: normalizedRequest.end ?? IMPOSSIBLE_LEVELS_SIZE,
      }),
    )
  }
  if (normalizedRequest.source === 'challengelist') {
    return censorLevels(
      await fetchChallengeList({
        start: normalizedRequest.start ?? 1,
        end: normalizedRequest.end ?? CHALLENGE_LIST_MAIN_SIZE,
      }),
    )
  }
  return censorLevels(await fetchPointercrateList(normalizedRequest.pointercrateParts))
}
