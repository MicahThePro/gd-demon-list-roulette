/**
 * Save codes and leaderboard codes have to survive being pasted.
 *
 * Both are one long base64 line, and a real one is big: a full 100 level run
 * encodes to around 20 KB. Nothing preserves a line that long intact. A
 * textarea wraps it, a phone keyboard inserts a newline, a chat app breaks it
 * across lines, and nearly every paste arrives with a trailing newline.
 *
 * Both decoders used to hand the raw string to atob, which rejects any
 * character that is not base64, so a code that had merely been wrapped was
 * reported as invalid -- "that save code is invalid or expired", for a code
 * that had been copied perfectly. Whitespace is now stripped before decoding.
 *
 * The codes are share codes, not proof of play, so nothing here is an integrity
 * check; a code that is genuinely truncated or mangled still has to fail.
 *
 * Run with: node src/utils/codes.test.js
 */
import { encodeRunState, decodeRunState, encodeHistory, decodeHistory } from './roulette.js'
import process from 'node:process'

let failures = 0
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  pass  ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`)
  }
}

const bigRun = {
  source: 'AREDL',
  currentTarget: 60,
  startingPercent: 0,
  percentStep: 1,
  levels: Array.from({ length: 120 }, (_, i) => ({
    id: `lvl-${i}`,
    name: `Level ${i} — hard`,
    video: `yt${i}`,
  })),
  rounds: Array.from({ length: 60 }, (_, i) => ({
    level: { id: `lvl-${i}`, name: `Level ${i} — hard` },
    targetPercent: i + 1,
    achievedPercent: i + 1,
    result: 'success',
    elapsedMs: 12345,
  })),
}

const bigHistory = [
  {
    id: '1700000000000-AREDL',
    at: 1700000000000,
    source: 'AREDL',
    step: 1,
    status: 'completed',
    score: 100,
    roundsPlayed: 100,
    passed: 100,
    skipped: 0,
    skipReasons: {},
    totalMs: 600000,
    avgMs: 6000,
    rounds: Array.from({ length: 100 }, (_, i) => [
      `lvl-${i}`,
      `Level ${i} — hard`,
      i + 1,
      i + 1,
      'success',
      6000,
      `yt${i}`,
      null,
    ]),
  },
]

const runCode = encodeRunState(bigRun)
const historyCode = encodeHistory(bigHistory)

// What a textarea or a chat app does to a line too long to display.
const wrap = (code, width) => code.match(new RegExp(`.{1,${width}}`, 'g')).join('\n')

console.log('an untouched code still works')
check('a run code decodes', decodeRunState(runCode) != null)
check('a leaderboard code decodes', decodeHistory(historyCode) != null)
check('the run keeps its rounds', decodeRunState(runCode)?.rounds?.length === 60)
check('the leaderboard keeps its runs', decodeHistory(historyCode)?.length === 1)

console.log('codes are long enough to be wrapped in transit')
check('a real run code is over 4 KB', runCode.length > 4000, String(runCode.length))
check('a real leaderboard code is over 4 KB', historyCode.length > 4000, String(historyCode.length))

console.log('a wrapped paste still loads')
for (const width of [40, 76, 80, 100, 250]) {
  check(`a run code wrapped at ${width} loads`, decodeRunState(wrap(runCode, width)) != null)
  check(`a leaderboard code wrapped at ${width} loads`, decodeHistory(wrap(historyCode, width)) != null)
}
check('a run code with a trailing newline loads', decodeRunState(`${runCode}\n`) != null)
check('a leaderboard code with a trailing newline loads', decodeHistory(`${historyCode}\n`) != null)
check('a run code pasted with indent still loads', decodeRunState(`\n   ${runCode}   \n`) != null)
check('a leaderboard code pasted with indent still loads', decodeHistory(`\n   ${historyCode}   \n`) != null)
check('tabs and spaces both go', decodeRunState(wrap(runCode, 90).replace(/\n/g, ' ')) != null)

console.log('a real problem is still refused')
check('random text is refused', decodeRunState('hello world') == null)
check('a truncated run code is refused', decodeRunState(runCode.slice(0, 200)) == null)
check('a tampered leaderboard code is refused', decodeHistory(`${historyCode.slice(0, -1)}x`) == null)
check('empty is refused', decodeRunState('') == null)
check('null is refused', decodeRunState(null) == null)

console.log('the two kinds are still not confused')
check('a run code is not read as a leaderboard code', decodeHistory(runCode) == null)
check('a leaderboard code is not read as a run code', decodeRunState(historyCode) == null)

if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll checks passed.')
