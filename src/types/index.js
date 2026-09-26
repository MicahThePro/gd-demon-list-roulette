/**
 * @typedef {Object} Level
 * @property {string} id
 * @property {string} name
 * @property {number} position
 * @property {string} [creator]
 * @property {string} [video]
 */

/**
 * @typedef {Object} RouletteRound
 * @property {number} roundNumber
 * @property {number} targetPercent
 * @property {number} achievedPercent
 * @property {'success'|'failure'} result
 * @property {Level} level
 */

/**
 * @typedef {Object} RouletteRun
 * @property {number} currentTarget
 * @property {number} startingPercent
 * @property {'active'|'failed'|'completed'} status
 * @property {RouletteRound[]} rounds
 * @property {string} source
 * @property {boolean} allowDuplicates
 * @property {Level[]} levels
 * @property {string[]} usedLevelIds
 * @property {Level | null} currentLevel
 * @property {number} endingPercent
 */

export const DEMO_SOURCES = ['pointercrate', 'shitty demon list', 'future custom list']
