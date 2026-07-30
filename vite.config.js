import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/taiyo-calendar/',
  plugins: [react()],
  server: { port: 5173 },
})
