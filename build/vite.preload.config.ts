import { defineConfig } from 'vite';

// Sandboxed preloads can't load ES modules or require local files, so the preload is a single
// self-contained CommonJS file; only `electron` stays external.
export default defineConfig({
  build: {
    outDir: 'out/preload',
    emptyOutDir: true,
    target: 'chrome152',
    sourcemap: true,
    minify: false,
    lib: {
      entry: 'src/preload/index.ts',
      formats: ['cjs'],
      fileName: () => 'index.cjs',
    },
    rolldownOptions: {
      external: ['electron'],
    },
  },
});
