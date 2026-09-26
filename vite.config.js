import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  base: './', // 👈 Add this line right here
  server: {
    host: true, 
    proxy: {
      '/api/pointercrate': {
        target: 'https://pointercrate.com/',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/pointercrate/, ''),
      },
    },
  },
})
