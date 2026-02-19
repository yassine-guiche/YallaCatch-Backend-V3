import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    cors: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split common heavy deps to improve initial load
          react: ['react', 'react-dom', 'react-router-dom'],

          charts: ['recharts'],
          maps: ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
})

