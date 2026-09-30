import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// Built from the config file's own directory rather than process.cwd(), because
// a build run from somewhere other than the project root would otherwise look
// for index.html in the wrong place and silently produce no output.
const fromRoot = (relativePath) => fileURLToPath(new URL(relativePath, import.meta.url))

export default defineConfig({
  plugins: [react()],
  // The site is served from a repository subpath on GitHub Pages
  // (micahthepro.github.io/gd-list-roulette/), so a relative base is what makes
  // the main page's assets resolve. The admin entry overrides it per input, so
  // its own assets are absolute under /admin/ instead.
  base: './',
  // Two HTML files, because the site is served from a static host that does no
  // URL rewriting. See admin/index.html: a client-side /admin route 404s there,
  // so the panel is built as its own entry with its own real directory.
  build: {
    rollupOptions: {
      input: {
        main: fromRoot('./index.html'),
        admin: fromRoot('./admin/index.html'),
      },
    },
  },
  server: {
    host: true, 
    proxy: {
      '/api/pointercrate': {
        target: 'https://pointercrate.com/',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/pointercrate/, ''),
      },
      '/api/gsl': {
        target: 'https://globalshittylist.com/',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/gsl/, '/api'),
      },
    },
  },
})
