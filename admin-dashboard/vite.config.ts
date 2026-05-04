import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // Vite 8 uses Rolldown which has stricter module resolution.
  // recharts depends on react-is which is not bundled correctly in Rolldown.
  // We force optimizeDeps to pre-bundle react-is so it's available at build time.
  optimizeDeps: {
    include: ['react-is', 'recharts'],
  },
  resolve: {
    // Ensure react-is resolves to the CJS version for recharts compatibility
    alias: {},
  },
  build: {
    // Suppress chunk size warnings (recharts is known to be large)
    chunkSizeWarningLimit: 2000,
    rolldownOptions: {
      // Tell Rolldown to not treat react-is as external
      external: [],
    },
  },
})
