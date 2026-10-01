/**
 * Runs the service tests through Vite's transform pipeline.
 *
 * The service modules import each other without file extensions, which node's ESM
 * resolver will not follow on its own. Vite already resolves them for the app, so
 * the tests are loaded through it rather than the app's imports being rewritten to
 * suit a test runner -- an import path that only resolves under one loader is a
 * trap for the next person.
 *
 * node:test still owns the assertions and the reporting; this only gets the
 * modules in.
 *
 * Run with: node scripts/service-test.mjs
 */
import { createServer } from 'vite'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('Usage: node scripts/service-test.mjs <test file> [more...]')
  process.exit(1)
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

try {
  for (const file of files) {
    await server.ssrLoadModule(file)
  }
} catch (error) {
  console.error('\nService tests failed to run:', error?.message ?? error)
  await server.close()
  process.exit(1)
}

await server.close()
