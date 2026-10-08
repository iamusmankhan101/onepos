import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Multi-page: the homepage plus one index.html per industry page, so each one
// is a real URL (/restaurants/ …) on any static host, no rewrites needed.
const PAGES = ['restaurants', 'coffee-shops', 'retail', 'dental-clinics']

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        ...Object.fromEntries(PAGES.map((p) => [p, `${p}/index.html`])),
      },
    },
  },
})
