import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

// Performance marks exist only in builds made with GALEO_PERF=1 (tests/perf).
const define = { __GALEO_PERF__: JSON.stringify(process.env['GALEO_PERF'] === '1') };

// Electron's main process: one ESM bundle for Node, with npm dependencies bundled in so the
// packaged app doesn't need node_modules at runtime.
export default defineConfig({
  define,
  build: {
    ssr: 'src/main/index.ts',
    outDir: 'out/main',
    emptyOutDir: true,
    target: 'node24',
    sourcemap: true,
    rolldownOptions: {
      external: ['electron', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
      output: { format: 'es', entryFileNames: 'index.js' },
    },
  },
  ssr: { noExternal: true },
});
