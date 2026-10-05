import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const serverPort = Number(process.env.PORT ?? 8787);

export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: {
      '/api': `http://localhost:${serverPort}`,
      '/login': `http://localhost:${serverPort}`,
      '/logout': `http://localhost:${serverPort}`,
      '/themes': `http://localhost:${serverPort}`,
      // Checkout returns and the mock payment page are server pages, not app routes.
      '/billing': `http://localhost:${serverPort}`,
      '/ws': { target: `ws://localhost:${serverPort}`, ws: true },
    },
  },
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
  },
});
