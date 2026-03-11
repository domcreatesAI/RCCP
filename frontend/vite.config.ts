import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  css: {
    // Disable Vite's built-in PostCSS pipeline so it doesn't double-process
    // the CSS that @tailwindcss/vite is already handling.
    postcss: { plugins: [] },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
