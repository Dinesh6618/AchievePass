import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'supabase/tests/**/*.test.ts', 'scripts/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
})
