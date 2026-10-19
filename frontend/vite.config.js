import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      // Neo gets its own bundle so the tester page ships no admin code.
      input: { main: resolve(import.meta.dirname, 'index.html'), neo: resolve(import.meta.dirname, 'neo/index.html') },
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/ws': { target: 'ws://127.0.0.1:8000', ws: true },
    },
  },
})
