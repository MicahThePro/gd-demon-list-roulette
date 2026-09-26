const POINTERCRATE_URL = import.meta.env.PROD 
  ? 'https://pointercrate.com' 
  : '/api/pointercrate'
const AREDL_URL = 'https://api.aredl.net/v2/api/aredl'
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
  const resolvedSource = source === 'aredl' ? 'aredl' : 'pointercrate'
  const normalizedStart = parsePositiveInteger(start)
  const normalizedEnd = parsePositiveInteger(end)

  if (resolvedSource === 'aredl') {
    const safeStart = normalizedStart ?? 1
    const safeEnd = normalizedEnd ?? 150

    if (safeStart > safeEnd) {
      throw new Error('AREDL start must be less than or equal to the end value.')
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

export const fetchList = async (request = {}) => {
  const normalizedRequest = normalizeListRequest(request)

  if (normalizedRequest.source === 'aredl') {
    return fetchAredlList(normalizedRequest)
  }

  return fetchPointercrateList()
}
