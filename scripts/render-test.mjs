/**
 * Runs the component render checks through Vite's transform pipeline.
 *
 * The checks live in v2.render.test.jsx because they need JSX and the same
 * import.meta.env the components already rely on, neither of which node parses
 * on its own. This file is the thin runner so `npm test` can invoke one command.
 *
 * Run with: node scripts/render-test.mjs
 */
import { createServer } from 'vite'

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

try {
  await server.ssrLoadModule('/src/components/v2.render.test.jsx')
} catch (error) {
  console.error('\nRender checks failed to run:', error?.message ?? error)
  await server.close()
  process.exit(1)
}

await server.close()
