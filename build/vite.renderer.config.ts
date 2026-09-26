import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The window renderer. Web workers imported with `new Worker(new URL(...))` are bundled by Vite
// as separate chunks of this build.
export default defineConfig({
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
