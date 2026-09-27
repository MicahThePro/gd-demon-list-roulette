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
// A snapshot is generated at build time by scripts/build-challenge-list.mjs
// and served from our own origin instead. The list of paths covers the usual
// ways this project gets served: a Vite build (copies public/ to dist/) and a
// plain static server pointed at the project root.
const CHALLENGE_LIST_URLS = [
  '/challenge-list.json',
  './challenge-list.json',
  '/public/challenge-list.json',
  '/dist/challenge-list.json',
]
// api.impossiblelevels.com sends no CORS headers, so the browser cannot fetch
// it. A snapshot is generated at build time by scripts/build-impossible-levels.mjs
// and served from our own origin instead. Only visible levels are included,
// which excludes the hidden legacy entries.
const IMPOSSIBLE_LEVELS_URLS = [
  '/impossible-levels.json',
  './impossible-levels.json',
  '/public/impossible-levels.json',
  '/dist/impossible-levels.json',
]
const IMPOSSIBLE_LEVELS_NAME = 'Impossible Levels List'
const IMPOSSIBLE_LEVELS_SIZE = 2116
const CHALLENGE_LIST_MAIN_SIZE = 100
const AREDL_DELAY_MS = 250
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

export const normalizeListRequest = ({ source = 'pointercrate', start, end } = {}) => {
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
        ? 'GSL'
        : resolvedSource === 'challengelist'
          ? 'Challenge List'
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
    }
  }
  return {
    source: resolvedSource,
    start: normalizedStart,
    end: normalizedEnd,
  }
}

const fetchPointercrateList = async () => {
  const firstPage = await fetch(`${POINTERCRATE_URL}/api/v2/demons/listed/?limit=100&after=0`)
  if (!firstPage.ok) {
    throw new Error('Failed to load the Pointercrate demon list.')
  }

  const firstPayload = await firstPage.json()
  const firstBatch = Array.isArray(firstPayload) ? firstPayload.map(mapPointercrateDemonToLevel) : []

  const remainingNeeded = Math.max(0, 150 - firstBatch.length)
  const finalLevels = [...firstBatch]

  if (remainingNeeded > 0) {
    const secondPage = await fetch(`${POINTERCRATE_URL}/api/v2/demons/listed/?limit=${remainingNeeded}&after=100`)
    if (!secondPage.ok) {
      throw new Error('Failed to load the remaining Pointercrate demon list.')
    }

    const secondPayload = await secondPage.json()
    const secondBatch = Array.isArray(secondPayload) ? secondPayload.map(mapPointercrateDemonToLevel) : []
    finalLevels.push(...secondBatch)
  }

  if (!finalLevels.length) {
    throw new Error('Pointercrate data could not be parsed.')
  }

  return {
    source: 'pointercrate',
    sourceTitle: 'Pointercrate Demon List',
    count: finalLevels.length,
    levels: finalLevels.slice(0, 150),
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

const hydrateAredlLevels = async (levels) => {
  const hydratedLevels = []

  for (const nextLevel of levels) {
    hydratedLevels.push(await fetchAredlLevelDetails(nextLevel))

    if (levels[levels.length - 1] !== nextLevel) {
      await wait(AREDL_DELAY_MS)
    }
  }

  return hydratedLevels
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
    sourceTitle: 'AREDL',
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
const fetchGslPage = async (offset, fetcher) => {
  const url = `${GSL_URL}?list=${GSL_LIST_TYPE}&limit=${GSL_PAGE_SIZE}&offset=${offset}`
  const response = await fetcher(url)
  if (!response?.ok) {
    throw new Error('Failed to load the Global Shitty List.')
  }
  const payload = await response.json()
  if (!payload?.ok) {
    throw new Error('Failed to load the Global Shitty List.')
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
    const { rows, total } = await fetchGslPage(0, fetcher)
    const positions = rows
      .map((row) => Number(row?.rank))
      .filter((value) => Number.isFinite(value) && value > 0)
    if (!positions.length) {
      return { start: 1, end: 150 }
    }
    return {
      start: 1,
      end: Math.max(total || 0, ...positions),
    }
  } catch {
    return { start: 1, end: 150 }
  }
}
const fetchGslList = async ({ start, end } = {}, fetcher = fetch) => {
  const rawLevels = []
  let offset = 0
  for (let page = 0; page < GSL_MAX_PAGES; page += 1) {
    const result = await fetchGslPage(offset, fetcher)
    rawLevels.push(...result.rows)
    if (!result.hasMore || result.rows.length === 0) {
      break
    }
    offset += result.rows.length
  }
  if (!rawLevels.length) {
    throw new Error('Global Shitty List data could not be parsed.')
  }
  const listView = rawLevels.map(mapGslLevelToLevel)
  const uniqueLevels = Array.from(new Map(listView.map((level) => [level.id, level])).values())
  const filteredLevels = filterLevelsByRange(uniqueLevels, start, end)
  if (!filteredLevels.length) {
    throw new Error('No Global Shitty List levels were found for that range.')
  }
  return {
    source: 'gsl',
    sourceTitle: 'Global Shitty List',
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
  levelId: item.levelId ?? null,
  position,
  name: item.name || `Challenge #${item.id}`,
  creator: item.creator || 'Unknown creator',
  video: item.video || null,
  thumbnail: item.video ? `https://i.ytimg.com/vi/${item.video}/mqdefault.jpg` : null,
  permalink: `https://challengelist.gd/challenges/${item.id}/`,
  detailUrl: `https://challengelist.gd/challenges/${item.id}/`,
})

const fetchChallengeListSnapshot = async (fetcher = fetch) => {
  for (const url of CHALLENGE_LIST_URLS) {
    try {
      const response = await fetcher(url)
      if (!response?.ok) {
        continue
      }

        const snapshot = await response.json()
        const levels = Array.isArray(snapshot?.levels) ? snapshot.levels : []

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
    sourceTitle: 'Challenge List',
    count: filtered.length,
    totalCount: parsed.levels.length,
    levels: filtered,
  }
}

const toImpossibleLevel = (item) => ({
  id: `impossiblelevels-${item.id ?? item.rank}`,
  levelId: item.levelId ?? null,
  position: item.rank,
  name: item.name || `Impossible level #${item.rank}`,
  creator: item.creator || 'Unknown creator',
  video: item.video || null,
  thumbnail: item.video ? `https://i.ytimg.com/vi/${item.video}/mqdefault.jpg` : null,
  permalink: item.permalink || 'https://impossiblelevels.com',
  detailUrl: item.permalink || 'https://impossiblelevels.com',
})

const fetchImpossibleLevelsSnapshot = async (fetcher = fetch) => {
  for (const url of IMPOSSIBLE_LEVELS_URLS) {
    try {
      const response = await fetcher(url)
      if (!response?.ok) {
        continue
      }

      const snapshot = await response.json()
      const levels = Array.isArray(snapshot?.levels) ? snapshot.levels : []

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

export const fetchList = async (request = {}) => {
  const normalizedRequest = normalizeListRequest(request)
  if (normalizedRequest.source === 'aredl') {
    return fetchAredlList(normalizedRequest)
  }
  if (normalizedRequest.source === 'gsl') {
    return fetchGslList(normalizedRequest)
  }
  if (normalizedRequest.source === 'impossiblelevels') {
    return fetchImpossibleLevels({
      start: normalizedRequest.start ?? 1,
      end: normalizedRequest.end ?? IMPOSSIBLE_LEVELS_SIZE,
    })
  }
  if (normalizedRequest.source === 'challengelist') {
    return fetchChallengeList({
      start: normalizedRequest.start ?? 1,
      end: normalizedRequest.end ?? CHALLENGE_LIST_MAIN_SIZE,
    })
  }
  return fetchPointercrateList()
}
