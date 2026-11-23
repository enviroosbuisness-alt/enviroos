import { defineConfig } from 'vite';

// EnviroOS is vanilla JS (no framework): js/*.js are classic side-effect
// scripts bundled in order via js/main.js. Static files (icons, manifest,
// service worker) live in public/ and are copied to dist/ verbatim.
// base './' keeps asset URLs relative so dist/ works from any sub-path.
export default defineConfig({
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
});
