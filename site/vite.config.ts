import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const serverPort = Number(process.env.SITE_PORT ?? 8800);

/** The project site's pages; `npm run site:dev` runs this next to the site server. */
export default defineConfig({
  root: 'site/web',
  plugins: [react()],
  server: {
    port: 5180,
    fs: { allow: ['../..'] },
    // Trailing slash: '/api' alone would also catch the page module /api.ts.
    proxy: { '/api/': `http://localhost:${serverPort}`, '/v1/': `http://localhost:${serverPort}` },
  },
  build: {
    outDir: '../../dist/site',
    emptyOutDir: true,
  },
});
