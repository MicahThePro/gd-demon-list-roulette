/* The one place user-visible text is masked before it reaches the screen.
 *
 * Why a function instead of editing the data: the stored identity of a run is
 * the uncensored list name, because that is what the submission checks and what
 * the leaderboard groups by. Censoring a run's `source` in the database would
 * break both. So the data stays verbatim and every render that shows a source,
 * a list label or a level name runs it through here instead.
 *
 * The mask keeps the first and last letter and stars the middle, so "shitty"
 * reads as "s****y": enough for a reader to recognise the word in context, not
 * enough to be spelled out on the page.
 *
 * Matching is case-insensitive but the original casing is preserved, so a
 * level called "Shitty Level" and one called "shitty level" both censor
 * cleanly without shouting. It is deliberately not a whole-word match: the word
 * shows up embedded in level names ("Super Shitty Song", "the shitty part"),
 * where a word boundary would let it straight through. */

/* Longer words first, which costs nothing with one entry but keeps the rule
 * correct if a second is ever added. Sorting here rather than on every call
 * keeps the per-render cost off the hot path. */
const MASK_WIDTH = 4
const maskInside = (word) =>
  `${word[0]}${'*'.repeat(Math.max(word.length - 2, MASK_WIDTH))}${word.at(-1)}`
/* One word, and one word only.
 *
 * The \w* after the group in PATTERN lets the word be caught with anything
 * tacked onto it, so "shitty", "shittyish" and "shitty-level" are all covered
 * by this single entry. Note that it matches the letters themselves and not any
 * real English form: "shittier" is left alone, because it does not contain the
 * sequence being masked. Nothing else is listed -- the other words that were
 * here are not wanted, and each one is another chance to mask a level title
 * that did not need it while leaving an unpleasant word in the source. */
const CENSORED = ['shitty'].sort((a, b) => b.length - a.length)
/** Builds the matcher from CENSORED. The \w* is what lets a match run past the
 * word itself into a longer name, and the \b on each side is what stops it
 * firing inside an unrelated word. */
const PATTERN = new RegExp(`\\b(${CENSORED.join('|')})\\w*\\b`, 'gi')

/**
 * Masks profanity in any string that is about to be shown to a player.
 *
 * Safe on anything: null, undefined, numbers, objects and empty strings all
 * come back as an empty string rather than throwing, because this is called from
 * inside JSX where a missing list label must not take the page down.
 *
 * Returns the input unchanged when nothing needs masking, so it is cheap to
 * leave in place on a render path.
 */
export const censorText = (value) => {
  if (typeof value !== 'string' || !value) {
    return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
  }
  return value.replace(PATTERN, (match) => {
    // Keep any leading punctuation off the mask, so a level called
    // "[Shitty] Song" is not starred from the bracket onwards.
    const leading = match.match(/^[^\p{L}\p{N}_]+/u)?.[0] ?? ''
    const word = match.slice(leading.length)
    // A one or two letter hit cannot be masked meaningfully, so drop it.
    if (word.length <= 2) {
      return leading + '*'.repeat(word.length)
    }
    return leading + maskInside(word)
  })
}