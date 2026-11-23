import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
// GitHub Pages использует /wonderfur-shop/, production-домен собирается с VITE_BASE=/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  base: process.env.VITE_BASE || '/wonderfur-shop/',
  preview: { host: '127.0.0.1', allowedHosts: true },
})
