import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { bundleGraph } from './bundle-graph.ts';
import { licences } from './licences.ts';

// Performance marks exist only in builds made with GALEO_PERF=1 (tests/perf).
const define = { __GALEO_PERF__: JSON.stringify(process.env['GALEO_PERF'] === '1') };

// Packages whose `browser` build needs a DOM, which the render worker doesn't have. The worker
// build takes their `worker` export instead (resolved by hand: enabling the `worker` condition
// globally would also switch react-dom on the UI thread).
const WORKER_ENTRIES: Record<string, string> = {
  'decode-named-character-reference': 'index.js',
  'hast-util-from-html-isomorphic': 'index.js',
};

function workerEntries(): Plugin {
  return {
    name: 'galeo-worker-entries',
    enforce: 'pre',
    resolveId(source) {
      const file = WORKER_ENTRIES[source];
      return file ? path.resolve(import.meta.dirname, '../node_modules', source, file) : null;
    },
  };
}

// The window renderer. Web workers imported with `new Worker(new URL(...))` are bundled by Vite
// as separate chunks of this build.
export default defineConfig(({ command }) => ({
  define,
  root: 'src/renderer',
  base: './',
  plugins: [react(), licences(), bundleGraph('window')],
  build: {
    outDir: '../../out/renderer',
    emptyOutDir: true,
    target: 'chrome152',
    sourcemap: true,
    // No `data:` assets: the CSP allows fonts only from the app itself.
    assetsInlineLimit: 0,
  },
  worker: { format: 'es', plugins: () => [workerEntries(), bundleGraph('worker')] },
  server: { host: '127.0.0.1', strictPort: false },
  // npm run dev: the dependency scan starts from the page and the render worker. Found only once the
  // worker loads, the worker's packages made Vite rebuild its dependencies and reload the page,
  // which left a second copy of React behind ("Invalid hook call").
  optimizeDeps: { entries: ['index.html', 'worker/render.worker.ts'] },
  // npm run dev serves the worker's modules through the page's pipeline, where worker.plugins don't
  // run: the same DOM-free entries, for page and worker alike (both work without a DOM).
  ...(command === 'serve'
    ? { resolve: { alias: Object.fromEntries(Object.entries(WORKER_ENTRIES).map(([name, file]) => [name, path.resolve(import.meta.dirname, '../node_modules', name, file)])) } }
    : {}),
}));
