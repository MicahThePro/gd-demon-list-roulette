import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeListRequest } from './listService'
import {
  DEFAULT_POINTERCRATE_PARTS,
  normalizePointercrateParts,
  pointercratePartRanges,
} from './pointercrateParts.js'

/**
 * The Pointercrate list parts, and the request that carries them.
 *
 * The bug this file exists for: `pointercrateParts` was added to the return of
 * the rankable sources branch only. Pointercrate is the one source that is NOT
 * rankable, so it fell through to the plain return at the bottom -- with no
 * parts on it at all. That read as undefined, normalized back to the default,
 * and the draw was Main and Extended whichever box was on. So ticking Legacy
 * did nothing at all, and it looked like the selection worked because the boxes
 * themselves ticked and unticked fine.
 */

test('the Pointercrate parts survive the request', async (t) => {
  await t.test('legacy alone is kept rather than replaced by the default', () => {
    assert.deepEqual(
      normalizeListRequest({ source: 'pointercrate', pointercrateParts: ['legacy'] }).pointercrateParts,
      ['legacy'],
    )
  })

  await t.test('both ranked parts are kept', () => {
    assert.deepEqual(
      normalizeListRequest({ source: 'pointercrate', pointercrateParts: ['main', 'extended'] }).pointercrateParts,
      ['main', 'extended'],
    )
  })

  await t.test('all three are kept', () => {
    assert.deepEqual(
      normalizeListRequest({ source: 'pointercrate', pointercrateParts: ['main', 'extended', 'legacy'] }).pointercrateParts,
      ['main', 'extended', 'legacy'],
    )
  })

  await t.test('nothing given means both ranked parts', () => {
    assert.deepEqual(
      normalizeListRequest({ source: 'pointercrate' }).pointercrateParts,
      ['main', 'extended'],
    )
  })

  await t.test('an unknown part is dropped rather than trusted', () => {
    assert.deepEqual(
      normalizeListRequest({ source: 'pointercrate', pointercrateParts: ['main', 'bogus'] }).pointercrateParts,
      ['main'],
    )
  })

  await t.test('the other four sources are undisturbed', () => {
    for (const source of ['aredl', 'gsl', 'challengelist', 'impossiblelevels']) {
      assert.equal(normalizeListRequest({ source, pointercrateParts: ['legacy'] }).source, source)
    }
  })
})

test("the ranges are the site's own three", async (t) => {
  const HIGHEST = 702

  await t.test('Main is 1-75', () => {
    assert.deepEqual(pointercratePartRanges(['main'], HIGHEST), [{ id: 'main', from: 1, to: 75 }])
  })

  await t.test('Extended is 76-150', () => {
    assert.deepEqual(pointercratePartRanges(['extended'], HIGHEST), [{ id: 'extended', from: 76, to: 150 }])
  })

  await t.test('Legacy is everything below 150', () => {
    assert.deepEqual(pointercratePartRanges(['legacy'], HIGHEST), [{ id: 'legacy', from: 151, to: 702 }])
  })

  await t.test('the two ranked parts together are the top 150, which is the default', () => {
    assert.deepEqual(pointercratePartRanges(DEFAULT_POINTERCRATE_PARTS, HIGHEST), [
      { id: 'main', from: 1, to: 75 },
      { id: 'extended', from: 76, to: 150 },
    ])
  })

  await t.test('they do not overlap, so no demon is ever in two parts', () => {
    assert.deepEqual(pointercratePartRanges(['main', 'extended', 'legacy'], HIGHEST), [
      { id: 'main', from: 1, to: 75 },
      { id: 'extended', from: 76, to: 150 },
      { id: 'legacy', from: 151, to: 702 },
    ])
  })

  await t.test('a range past the end of the list is clipped, not dropped', () => {
    assert.deepEqual(pointercratePartRanges(['legacy'], 300), [{ id: 'legacy', from: 151, to: 300 }])
  })

  await t.test('a range entirely past the end is dropped', () => {
    assert.deepEqual(pointercratePartRanges(['legacy'], 100), [])
  })
})

test('a stored selection is normalized rather than trusted', async (t) => {
  await t.test('an empty selection falls back to the default, not to nothing', () => {
    assert.deepEqual(normalizePointercrateParts([]), ['main', 'extended'])
    assert.deepEqual(normalizePointercrateParts(null), ['main', 'extended'])
  })

  await t.test('order does not matter, so the same choice always draws the same', () => {
    assert.deepEqual(
      normalizePointercrateParts(['legacy', 'main', 'extended']),
      normalizePointercrateParts(['main', 'extended', 'legacy']),
    )
  })

  await t.test('a hand-edited cookie string is accepted', () => {
    assert.deepEqual(normalizePointercrateParts('legacy'), ['legacy'])
    assert.deepEqual(normalizePointercrateParts('legacy,main'), ['main', 'legacy'])
  })

  await t.test('an unknown part is dropped', () => {
    assert.deepEqual(normalizePointercrateParts(['main', 'nonsense']), ['main'])
  })
})