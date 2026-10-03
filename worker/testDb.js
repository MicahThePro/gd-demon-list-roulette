/**
 * A D1 stand-in for the tests, backed by node:sqlite in memory.
 *
 * The real request handler, the real SQL and the real passcode check all run
 * against this; what is verified is the code that ships. It is not a mock of the
 * database, only of the binding D1 puts around it.
 *
 * Two things have to be reconciled. The Worker code is written against D1, whose
 * statements are promise-based (`.bind(..).first()`), while node:sqlite's are
 * synchronous. And `run()` has to report how many rows it changed, because the
 * code that lifts a ban reads `meta.changes` to tell whether it found anything.
 *
 * Shared rather than copied into each test file: four near-identical shims is how one
 * of them ends up subtly wrong and quietly tests less than it appears to.
 *
 * The migrations are all applied, in order, rather than each test naming the ones
 * it needs. A test that listed its own subset would pass against a schema the
 * production database does not actually have, which is the failure this is meant to
 * catch.
 */
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const SCHEMA = readdirSync(join(here, 'migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => readFileSync(join(here, 'migrations', name), 'utf8'))
  .join('\n')

export const createTestDb = () => {
  const db = new DatabaseSync(':memory:')
  db.exec(SCHEMA)

  const wrap = (statement, values) => ({
    first: async () => statement.get(...values) ?? null,
    all: async () => ({ results: statement.all(...values) }),
    run: async () => {
      const result = statement.run(...values)
      return {
        success: true,
        // D1 reports how many rows a write touched, and the unban path reads it to
        // tell "lifted a ban" from "there was no ban". node:sqlite reports it as
        // `changes`, so it is mapped onto the name the Worker code already uses.
        meta: { changes: result.changes ?? 0 },
      }
    },
  })

  const prepared = (sql) => {
    const statement = db.prepare(sql)
    return {
      bind: (...values) => wrap(statement, values),
      first: async () => statement.get() ?? null,
      all: async () => ({ results: statement.all() }),
      run: async () => wrap(statement, []).run(),
    }
  }

  return {
    prepare: prepared,
    batch: async (statements) => {
      db.exec('BEGIN')
      try {
        for (const statement of statements) {
          await statement.run()
        }
        db.exec('COMMIT')
        return { success: true, meta: { changes: 0 } }
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    /** Not part of D1's surface; used by the tests to drop the in-memory database. */
    close: () => db.close(),
    /** Raw access, for a test that wants to assert on a stored row directly. */
    raw: db,
  }
}