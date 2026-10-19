import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      '/api': process.env.SENTINEL_API_TARGET || 'http://127.0.0.1:8000',
      '/ws': { target: (process.env.SENTINEL_API_TARGET || 'http://127.0.0.1:8000').replace(/^http/, 'ws'), ws: true },
    },
  },
})
