import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  /* La API corre aparte en desarrollo; así el navegador la ve en el mismo origen. */
  server: { proxy: { '/api': 'http://127.0.0.1:8010' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8010' } },
})
