/**
 * The list names have to agree everywhere.
 *
 * A run's `source` is a display name the list loader stamps on it, the Worker
 * refuses a run whose source it does not recognise, and the global leaderboard
 * filters on that same string. All three used to carry their own copy of those
 * five names, and AREDL drifted: the loader said 'AREDL' while the other two
 * said 'All Rated Extreme Demons List'. The result was an AREDL run that could
 * be played, saved, and then refused at the submit button with a message saying
 * it was not one of the five lists.
 *
 * The client now derives its copy from the loader, so only the Worker keeps a
 * second one -- it is a separate deployment and cannot import from src/. This
 * checks the two against each other, and against the five names both should
 * hold.
 *
 * Checked as text rather than imported: the two services import each other, and
 * a module cycle would make this unrunnable for no benefit.
 *
 * Run with: node src/services/sourceNames.test.js
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')

// The five lists the site can play, as a run's `source` spells them.
const EXPECTED = [
  'Pointercrate Demon List',
  'AREDL',
  'Global Shitty List',
  'Challenge List',
  'Impossible Levels List',
]

let failures = 0
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  pass  ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`)
  }
}

const listService = read('./listService.js')
const apiService = read('./apiService.js')
const globalBoard = read('../components/GlobalLeaderboard.jsx')
const worker = read('../../worker/api.js')

console.log('the canonical names come from the list loader')
const canonical = listService.match(/export const LIST_SOURCES = \{([\s\S]*?)\n\}/)?.[1] ?? ''
const names = [...canonical.matchAll(/:\s*'([^']+)'/g)].map((match) => match[1])

check('there are exactly five lists', names.length === EXPECTED.length, JSON.stringify(names))
for (const name of EXPECTED) {
  check(`${name} is one of them`, names.includes(name), JSON.stringify(names))
}
check(
  'the long form of the AREDL name is not used as data',
  !canonical.includes('All Rated Extreme Demons List'),
)

console.log('the loader stamps those names on every run')
check('no list name is retyped at a sourceTitle', !/sourceTitle:\s*'/.test(listService))

console.log('the client accepts back what the loader produces')
check('the submittable lists are derived, not retyped', /Object\.values\(LIST_SOURCES\)/.test(apiService))

console.log('the global board filters on the same names')
check('its list filter is derived', /LIST_SOURCES/.test(globalBoard))
check('it does not hardcode the long AREDL name', !/id:\s*'All Rated Extreme Demons List'/.test(globalBoard))

console.log('the worker accepts the same names')
const workerBlock = worker.match(/const SOURCE_NAMES = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? ''
const workerNames = [...workerBlock.matchAll(/'([^']+)'/g)].map((match) => match[1])
for (const name of EXPECTED) {
  check(`the worker accepts ${name}`, workerNames.includes(name), JSON.stringify(workerNames))
}
check('the worker has no long AREDL name', !workerNames.includes('All Rated Extreme Demons List'))

if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll checks passed.')
