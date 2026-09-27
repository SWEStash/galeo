import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

// Performance marks exist only in builds made with GALEO_PERF=1 (tests/perf).
const define = { __GALEO_PERF__: JSON.stringify(process.env['GALEO_PERF'] === '1') };

// Electron's main process: ESM bundles for Node, with npm dependencies bundled in so the
// packaged app doesn't need node_modules at runtime.
export default defineConfig({
  define,
  build: {
    ssr: true,
    outDir: 'out/main',
    emptyOutDir: true,
    target: 'node24',
    sourcemap: true,
    rolldownOptions: {
      // The main process, and the worker thread that parses documents for main's checks.
      input: { index: 'src/main/index.ts', 'task-worker': 'src/main/tasks/worker.ts' },
      external: ['electron', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
      output: { format: 'es', entryFileNames: '[name].js' },
    },
  },
  ssr: { noExternal: true },
});
