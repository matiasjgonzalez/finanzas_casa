import { readFileSync } from 'node:fs'
import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Versión de la app (package.json), visible al pie del menú.
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    port: 5173,
    // En desarrollo, el frontend y la API se ven como un mismo origen (localhost:5173):
    // las cookies de sesión funcionan sin configurar CORS en el navegador.
    proxy: {
      // API_PROXY_TARGET permite apuntar a otra instancia de la API (por ejemplo, una de pruebas).
      '/api': { target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000', changeOrigin: false },
    },
  },
})
