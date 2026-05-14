import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
    // Docker Desktop on Windows often misses file-watch events; without polling, Vite keeps an old bundle.
    watch: {
      usePolling: true,
      interval: 200,
    },
    proxy: {
      '/api': {
        // In Docker: api-gateway hostname. On host-only dev: set API_GATEWAY_URL=http://127.0.0.1:8080
        target: process.env.API_GATEWAY_URL ?? 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  }
})
