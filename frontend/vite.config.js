import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // /api goes to the same backend the web app calls (VITE_API_URL), so the
  // member app copy at /member (which uses this site's own /api) logs in
  // against it too.
  const apiUrl = loadEnv(mode, process.cwd(), '').VITE_API_URL || process.env.VITE_API_URL || '';
  let proxyTarget = 'http://localhost:8000';
  try {
    if (apiUrl) proxyTarget = new URL(apiUrl).origin;
  } catch {
    // Not a full URL (e.g. "/api"): keep the default backend.
  }

  return {
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
          target: proxyTarget,
          changeOrigin: true
        }
      }
    }
  };
});
