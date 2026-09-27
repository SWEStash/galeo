import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Performance marks exist only in builds made with GALEO_PERF=1 (tests/perf).
const define = { __GALEO_PERF__: JSON.stringify(process.env['GALEO_PERF'] === '1') };

// The window renderer. Web workers imported with `new Worker(new URL(...))` are bundled by Vite
// as separate chunks of this build.
export default defineConfig({
  define,
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../../out/renderer',
    emptyOutDir: true,
    target: 'chrome152',
    sourcemap: true,
  },
  worker: { format: 'es' },
  server: { host: '127.0.0.1', strictPort: false },
});
