import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In production, nginx handles all /api/* proxying to internal services.
// During local development (npm run dev), Vite's dev server proxies the
// same paths to the backends running on localhost.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/auth':     { target: 'http://localhost:3001', rewrite: (p) => p.replace(/^\/api\/auth/, ''),     changeOrigin: true },
      '/api/health':   { target: 'http://localhost:3002', rewrite: (p) => p.replace(/^\/api\/health/, ''),   changeOrigin: true },
      '/api/reminder': { target: 'http://localhost:3003', rewrite: (p) => p.replace(/^\/api\/reminder/, ''), changeOrigin: true },
      '/api/alert':    { target: 'http://localhost:3004', rewrite: (p) => p.replace(/^\/api\/alert/, ''),    changeOrigin: true },
    },
  },
});
