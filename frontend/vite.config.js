import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // html2pdf.js (report "Download PDF") loads html2canvas, which cannot
      // read the oklch() colours Tailwind v4 uses and throws. html2canvas-pro
      // is a drop-in fork that supports them.
      html2canvas: 'html2canvas-pro'
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true
      }
    }
  }
});
