import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    copyPublicDir: false,
  },
  css: {
    preprocessorMaxWorkers: 0,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5069',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:5069',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})