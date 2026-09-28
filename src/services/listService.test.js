import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeListRequest, filterLevelsByRange, mapAredlDetailToLevel, fetchAredlLevelDetails, fetchList } from './listService.js'
import { encodeRunState, decodeRunState, pickNextLevel, getElapsedLevelTimeMs, formatDurationMs } from '../utils/roulette.js'

test('normalizeListRequest defaults to Pointercrate and validates AREDL ranges', () => {
  assert.deepEqual(normalizeListRequest({}), {
    source: 'pointercrate',
    start: null,
    end: null,
  })

  assert.deepEqual(normalizeListRequest({ source: 'aredl', start: '500', end: '1000' }), {
    source: 'aredl',
    start: 500,
    end: 1000,
  })

  assert.throws(() => normalizeListRequest({ source: 'aredl', start: '1000', end: '500' }), /start.*end/i)
})

test('filterLevelsByRange keeps only positions in the selected range', () => {
  const levels = [
    { id: 1, position: 1 },
    { id: 2, position: 499 },
    { id: 3, position: 500 },
    { id: 4, position: 750 },
    { id: 5, position: 1000 },
    { id: 6, position: 1001 },
  ]

  assert.deepEqual(filterLevelsByRange(levels, 500, 1000).map((level) => level.id), [3, 4, 5])
})

test('mapAredlDetailToLevel hydrates creator, video, and thumbnail from the detail payload', () => {
  const level = mapAredlDetailToLevel({
    name: 'Society',
    position: 1,
    level_id: 127323087,
    publisher: { global_name: 'Neomarbilan', username: 'ec99836c7' },
    verifications: [{ video_url: 'https://www.youtube.com/watch?v=3CoEaH1CM7o' }],
  })

  assert.equal(level.creator, 'Neomarbilan')
  assert.equal(level.video, '3CoEaH1CM7o')
  assert.equal(level.thumbnail, 'https://i.ytimg.com/vi/3CoEaH1CM7o/mqdefault.jpg')
})

test('fetchAredlLevelDetails loads a single level without a batch list request', async () => {
  const fetcher = async (url) => {
    assert.match(url, /\/levels\/127323087$/)
    return {
      ok: true,
      json: async () => ({
        level_id: 127323087,
        name: 'Society',
        position: 1,
        publisher: { global_name: 'Neomarbilan' },
        verifications: [{ video_url: 'https://youtu.be/3CoEaH1CM7o' }],
      }),
    }
  }

  const level = await fetchAredlLevelDetails({ levelId: 127323087 }, fetcher)
  assert.equal(level.creator, 'Neomarbilan')
  assert.equal(level.video, '3CoEaH1CM7o')
})

test('fetchAredlLevelDetails retries after a 429 rate-limit response', async () => {
  let attempts = 0
  const fetcher = async (url) => {
    attempts += 1
    if (attempts === 1) {
      return { ok: false, status: 429 }
    }

    assert.match(url, /\/levels\/127323087$/)
    return {
      ok: true,
      json: async () => ({
        level_id: 127323087,
        name: 'Society',
        position: 1,
        publisher: { global_name: 'Neomarbilan' },
        verifications: [{ video_url: 'https://youtu.be/3CoEaH1CM7o' }],
      }),
    }
  }

  const level = await fetchAredlLevelDetails({ levelId: 127323087 }, fetcher)
  assert.equal(level.creator, 'Neomarbilan')
  assert.equal(level.video, '3CoEaH1CM7o')
  assert.equal(attempts, 2)
})

test('fetchList for AREDL does not hydrate every level before the run starts', async () => {
  const calls = []
  const previousFetch = global.fetch

  global.fetch = async (url) => {
    calls.push(url)

    if (url.includes('/levels?')) {
      return {
        ok: true,
        json: async () => [
          { level_id: 1, position: 1, name: 'One', publisher: { global_name: 'A' } },
          { level_id: 2, position: 2, name: 'Two', publisher: { global_name: 'B' } },
          { level_id: 3, position: 3, name: 'Three', publisher: { global_name: 'C' } },
        ],
      }
    }

    if (url.includes('/levels/')) {
      return {
        ok: true,
        json: async () => ({
          level_id: Number(url.split('/').at(-1)),
          position: Number(url.split('/').at(-1)),
          name: `Level ${url.split('/').at(-1)}`,
          publisher: { global_name: 'Hydrated' },
          verifications: [{ video_url: 'https://youtu.be/3CoEaH1CM7o' }],
        }),
      }
    }

    throw new Error(`Unexpected fetch URL: ${url}`)
  }

  try {
    const result = await fetchList({ source: 'aredl', start: 1, end: 3 })
    assert.equal(result.levels.length, 3)
    assert.deepEqual(calls.filter((url) => url.includes('/levels/')), [])
  } finally {
    global.fetch = previousFetch
  }
})

test('pickNextLevel never repeats before the pool is exhausted, and then repeats only after the list is fully used', () => {
  const levels = [
    { id: 'a' },
    { id: 'b' },
    { id: 'c' },
  ]

  const first = pickNextLevel(levels, [])
  const second = pickNextLevel(levels, [first.id])
  const third = pickNextLevel(levels, [first.id, second.id])
  const forcedRepeat = pickNextLevel(levels, [first.id, second.id, third.id])

  assert.ok(levels.some((level) => level.id === first.id))
  assert.notEqual(second.id, first.id)
  assert.notEqual(third.id, first.id)
  assert.notEqual(third.id, second.id)
  assert.ok(['a', 'b', 'c'].includes(forcedRepeat.id))
})

test('getElapsedLevelTimeMs and formatDurationMs provide a running timer for each level', () => {
  const startedAt = Date.now() - 65000

  assert.equal(getElapsedLevelTimeMs({ currentLevelStartedAt: startedAt }), 65000)
  assert.equal(formatDurationMs(65000), '01:05')
  assert.equal(formatDurationMs(3600000 + 75000), '1:01:15')
})

test('encodeRunState round-trips a run state and preserves skip metadata', () => {
  const run = {
    currentTarget: 8,
    skippedCount: 1,
    rounds: [{
      roundNumber: 1,
      targetPercent: 7,
      achievedPercent: null,
      result: 'skipped',
      level: {
        id: 42,
        name: 'Skip test',
        creator: 'Tester',
      },
    }],
  }

  const encoded = encodeRunState(run)
  assert.equal(typeof encoded, 'string')
  assert.deepEqual(decodeRunState(encoded), run)
})

test('run save codes use the GDLRS1: prefix', () => {
  const encoded = encodeRunState({ currentTarget: 5, rounds: [] })
  assert.ok(encoded.startsWith('GDLRS1:'), `expected a GDLRS1: prefix, got ${encoded.slice(0, 12)}`)
})

test('run save codes saved with the old DLRS1: prefix still load', () => {
  const run = { currentTarget: 3, rounds: [] }

  // Rewriting the current prefix to the retired one stands in for a code that
  // was copied out of the app before the rename; the payload is untouched.
  const old = encodeRunState(run).replace(/^GDLRS1:/, 'DLRS1:')

  assert.ok(old.startsWith('DLRS1:'))
  assert.deepEqual(decodeRunState(old), run)
})
