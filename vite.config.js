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
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '^/rover-pi/api/': {
        target: 'http://127.0.0.1:8088',
        // Keep the browser-facing host so the Pi can enforce its origin checks.
        changeOrigin: false,
        rewrite: path => path.replace(/^\/rover-pi/, ''),
        configure(proxy) {
          proxy.on('error', (_error, _request, response) => {
            if (!response?.writeHead || response.headersSent || response.writableEnded) return;
            response.writeHead(503, {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
            }).end(JSON.stringify({
              error: 'The app server could not reach the Pi control API at 127.0.0.1:8088. Start the Pi control service or enter the address of the Pi that runs it. ESP32 MQTT readings use a separate connection.',
            }));
          });
        }
      }
    }
  }
});
