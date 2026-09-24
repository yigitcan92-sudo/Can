import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // exceljs (~900 kB) wordt enkel lazy geladen op de Beheer-pagina
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: { manualChunks: { charts: ['recharts'] } },
    },
  },
});
