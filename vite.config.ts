import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  publicDir: 'public',
  base: './',
  server: { host: true, port: 5173 },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
});
