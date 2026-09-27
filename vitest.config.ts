import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __GALEO_PERF__: 'false' },
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'src/{core,shared,main}/**/*.test.ts',
            'tests/unit/**/*.test.ts',
            'tests/security/**/*.test.ts',
            'tests/perf/**/*.test.ts',
            'scripts/**/*.test.mjs',
          ],
        },
      },
      {
        test: {
          name: 'renderer',
          environment: 'happy-dom',
          include: ['src/renderer/**/*.test.{ts,tsx}', 'tests/renderer/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
