/**
 * Cloudflare Worker that serves the two list sources this app cannot fetch
 * directly from the browser, because neither upstream sends CORS headers, and
 * that backs the v2 accounts and global leaderboard with a D1 database.
 *
 *   /impossible-levels      -> proxied and filtered from the Impossible Levels API
 *   /challenge-list         -> scraped and parsed from challengelist.gd into the
 *                              same shape as the build-time snapshot
 *   /impossible-level-rate  -> the TPS/FPS badge for one level, read from that
 *                              level's page
 *
 *   /api/register /api/login /api/logout /api/me (GET, PATCH)
 *   /api/runs (GET, POST) /api/runs/:id (DELETE) /api/my-entries (GET)
 *   /api/leaderboard
 *
 *   /api/submissions (POST) /api/submissions/mine (GET)
 *   /api/admin/submissions (GET) /api/admin/submissions/:id (GET)
 *   /api/admin/submissions/:id/approve | /reject | /delete (POST)
 *   /api/admin/accounts/:id/runs/:runId/trash | /untrash (POST)
 *
 *   env.ADMIN_PASSCODE  PBKDF2 hash of the moderation passcode
 *
 * The list endpoints are the same three as before, unchanged, and keep sending
 * Access-Control-Allow-Origin so the site can call them. Every request re-reads
 * upstream, so the counts stay current without a rebuild, and cache-control
 * keeps browsers from re-fetching on every click.
 *
 * The API endpoints are also CORS open, because the site is served from GitHub
 * Pages on a different origin from the Worker. That is safe to do because
 * nothing is readable without a session token: the leaderboard is public, and
 * everything that writes needs the Authorization header a third party site
 * cannot read.
 */

import { handleAccountRoutes } from './api.js'
import { handleSubmissionRoutes } from './submissions.js'
import {
  handleAdminAccountRoutes,
  handleLoginCodeRoutes,
  handlePlayerDataRoutes,
} from './accounts.js'
import { checkProtocol } from './protocol.js'

const IMPOSSIBLE_LEVELS_API = 'https://api.impossiblelevels.com/api/levels'
const CHALLENGE_LIST_URL = 'https://challengelist.gd/challenges/'
const CHALLENGE_LIST_DETAIL = (id) => `https://challengelist.gd/challenges/${id}/`
const IMPOSSIBLE_LEVEL_PAGE = (id) => `https://impossiblelevels.com/level/${id}`

// challengelist.gd only publishes a 100 level main list. The legacy list is
// deliberately ignored: most of those levels were deleted from the site, so
// their detail pages expose no level id or video any more.
const CHALLENGE_LIST_SIZE = 100

// The detail pages are fetched a few at a time to stay polite.
const DETAIL_CONCURRENCY = 4

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  // PUT is here because the player data mirror is a PUT. It was missing for the
  // whole life of that route, so every upload was refused at the preflight and
  // the mirror a moderator reads in the admin panel was permanently empty. A
  // browser checks this list before the request is ever sent, so the failure was
  // invisible server-side: no route ran, no error was logged, and the console
  // said only "Failed to load resource".
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization, X-Admin-Passcode',
  // A browser is only allowed to read a response with a custom header on it if
  // the response opts in, so the leaderboard needs this to be readable at all.
  'access-control-expose-headers': 'Content-Type',
  'access-control-max-age': '86400',
}

// The gate's own header has to be allowed through the preflight, or no request
// carrying it would ever reach the Worker. Listed here and nowhere else.
const PROTOCOL_ALLOW_HEADER = 'x-dlr-protocol'

const CORS_WITH_PROTOCOL = {
  ...CORS_HEADERS,
  'access-control-allow-headers': `${CORS_HEADERS['access-control-allow-headers']}, ${PROTOCOL_ALLOW_HEADER}`,
}

const json = (data, init = {}) => {
  const { headers, ...rest } = init
  return new Response(JSON.stringify(data), {
    ...rest,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=900',
      // With the gate's header, not the bare CORS set: the version refusal is
      // itself a CORS response the browser has to be allowed to read, otherwise
      // an archived build sees an opaque network failure instead of being told
      // the server refused it.
      ...CORS_WITH_PROTOCOL,
      // Caller-supplied headers come last so they win; spreading them first
      // would silently drop the per-route cache-control.
      ...headers,
    },
  })
}

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

/**
 * The rate a level must be played at, as the site labels it, e.g. "240 TPS".
 *
 * The unit is NOT derivable from the number: the site shows TPS only for
 * levels carrying the 2.2 tag, so the same rate appears under both units
 * (240 is mostly TPS, 120 is mostly FPS). The list API has no tags field and
 * its free-text versionPossible disagrees with the rendered label on some
 * entries, so the rendered badge is read straight off the level's own page.
 *
 * The required game version comes off the same page, for the same reason: the
 * list API's versionPossible is free text and disagrees with what the site
 * renders (some levels say "2.2" there but show no version tag at all).
 *
 * This is served per level rather than for the whole list on purpose. A Worker
 * has a hard subrequest limit, so scraping all ~2100 pages inside one request
 * is not possible; the app only ever displays the rate and version for the
 * level it is currently on, which makes a single fetch per request the right
 * shape. The long cache-control means each level is only ever fetched about
 * once a day, at the edge, shared by every visitor.
 */
const RATE_LABEL = /text-2xl font-bold text-(?:white|amber-400)">([0-9.]+) (FPS|TPS)</

// The site renders every tag as the same blue pill, so the markup alone cannot
// tell a version tag from "2 Player", "Rated" or "Tentative Placement". Only
// these three names denote a game version, so the text has to be matched too.
const VERSION_TAGS = new Set(['<2.1', '2.1', '2.2'])
const TAG_PILL =
  /<span class="px-3 py-1\.5 bg-blue-600\/90 text-blue-100 rounded-full border border-blue-400 group relative text-sm">([^<]+)</

const getImpossibleLevelDetails = async (id) => {
  const response = await fetch(IMPOSSIBLE_LEVEL_PAGE(id))
  if (!response.ok) {
    throw new Error(`Impossible Levels page returned ${response.status}`)
  }

  const html = await response.text()
  const match = html.match(RATE_LABEL)

  // A null version is a real answer, not a failure: most levels have no
  // version tag, and erroring here would make the client retry constantly.
  const versions = [...html.matchAll(new RegExp(TAG_PILL.source, 'g'))]
    .map((m) => m[1].trim())
    .filter((name) => VERSION_TAGS.has(name))

  return {
    rate: match ? `${match[1]} ${match[2]}` : null,
    // At most one version tag in practice, but joining keeps a hypothetical
    // multi-version level readable instead of silently dropping one.
    version: versions.length ? versions.join(' / ') : null,
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

// Served for a long time: a level's required rate changes only when the list
// revises it, and every visitor asking about the same level shares this copy.
const RATE_CACHE_CONTROL =
  'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'

// The session cookie is only a convenience: it lets the account survive a page
// reload on a browser that blocks third-party cookies. The app itself always
// sends the token in an Authorization header, which is what is actually
// checked. SameSite=Lax plus Secure means it is never attached to a cross-site
// request, so this cookie cannot be used to ride on someone else's session.
const SESSION_COOKIE = (token, maxAgeSeconds) =>
  `dlr_session=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax; Secure`

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_WITH_PROTOCOL })
    }

    const url = new URL(request.url)
    const key = url.pathname.replace(/^\/+/, '').replace(/\.json$/, '')

    if (key === 'api' || key.startsWith('api/')) {
      /* The version gate, before anything else touches the database.
       *
       * An archived build under versions/ is still a working site and used to be
       * able to sign in and submit from here, scoring runs with rules that no
       * longer exist. Those builds are blocked in the browser too, but that guard
       * is only a speed bump -- devtools undoes it. This is the real rule: a
       * request without the current protocol header is refused before a route
       * runs, and refusing costs nothing because no row is written either way.
       *
       * Only /api/* is gated. The list endpoints above stay open to every build,
       * because reading the level lists is what an archived version needs in
       * order to still be playable. */
      const protocol = checkProtocol(request)
      if (!protocol.ok) {
        return json(
          { error: protocol.error },
          { status: protocol.status, headers: { 'cache-control': 'no-store' } },
        )
      }

      // A missing binding means the D1 database has not been created or bound
      // yet. Saying so plainly beats a 500 with no explanation, and the list
      // endpoints keep working either way.
      if (!env?.DB) {
        return json(
          { error: 'This Worker has no database bound. Create the D1 database and deploy again.' },
          { status: 503, headers: { 'cache-control': 'no-store' } },
        )
      }

      try {
        // The account administration routes, matched before the submission queue
        // because that one claims the whole "admin/" prefix and would answer
        // "Unknown admin endpoint" for an account path.
        const account = await handleAdminAccountRoutes({
          db: env.DB,
          request,
          url,
          key,
          adminPasscode: env.ADMIN_PASSCODE,
        })
        if (account) {
          return json(account.error ? { error: account.error } : (account.body ?? {}), {
            status: account.status ?? 200,
            headers: { 'cache-control': 'no-store' },
          })
        }

        // The video routes come next because they own /api/submissions and
        // /api/admin/submissions; anything they do not match falls through to the
        // account routes below.
        const submission = await handleSubmissionRoutes({
          db: env.DB,
          request,
          url,
          key,
          adminPasscode: env.ADMIN_PASSCODE,
        })
        if (submission) {
          const headers = { 'cache-control': 'no-store' }
          return json(submission.error ? { error: submission.error } : (submission.body ?? {}), {
            status: submission.status ?? 200,
            headers,
          })
        }

        // The player's own mirrored data, and redeeming a one-time login code.
        // Neither is an admin route, so both are checked the other way round: by
        // the caller's own session, or by the code itself.
        const selfService = (await handlePlayerDataRoutes({ db: env.DB, request, key })) ??
          (await handleLoginCodeRoutes({ db: env.DB, request, key }))
        if (selfService) {
          const headers = { 'cache-control': 'no-store' }
          if (selfService.setCookie) {
            headers['set-cookie'] = SESSION_COOKIE(selfService.setCookie, 60 * 60 * 24 * 30)
          }
          return json(selfService.error ? { error: selfService.error } : (selfService.body ?? {}), {
            status: selfService.status ?? 200,
            headers,
          })
        }

        const result = await handleAccountRoutes({ db: env.DB, request, url, key })
        if (result) {
          const headers = { 'cache-control': 'no-store' }
          if (result.setCookie) {
            headers['set-cookie'] = SESSION_COOKIE(result.setCookie, 60 * 60 * 24 * 30)
          }
          if (result.clearCookie) {
            headers['set-cookie'] = SESSION_COOKIE('', 0)
          }

          // A route reports a failure as { error, status }, and success as
          // { body, status }. Both shapes have to reach the client: reading
          // only result.body sent `{}` with the right status code, so a wrong
          // password came back as a 401 with no explanation and the sign in
          // form had nothing to show.
          //
          // A failure may carry fields beside the error, and they have to be
          // passed through: the display name route refuses with how long is
          // left, so the client can draw its countdown from the number the server
          // already had instead of re-reading the account to ask again.
          // `error` and `user` are never sent together, so a caller reading
          // result.error cannot see a success with an error attached.
          const payload = result.error
            ? { error: result.error, cooldown: result.cooldown ?? null }
            : (result.body ?? {})

          return json(payload, { status: result.status ?? 200, headers })
        }
      } catch (error) {
        return json(
          { error: error?.message ?? 'Something went wrong on the server' },
          { status: 500, headers: { 'cache-control': 'no-store' } },
        )
      }

      return json({ error: 'Unknown endpoint' }, { status: 404, headers: { 'cache-control': 'no-store' } })
    }

    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, { status: 405 })
    }

    if (key === 'impossible-level-rate') {
      const id = url.searchParams.get('id')
      if (!/^\d+$/.test(id ?? '')) {
        return json({ error: 'A numeric level id is required' }, { status: 400 })
      }

      try {
        const data = await getImpossibleLevelDetails(id)
        return json(data, { headers: { 'cache-control': RATE_CACHE_CONTROL } })
      } catch (error) {
        return json({ error: error?.message ?? 'Failed to read level details' }, { status: 502 })
      }
    }

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
