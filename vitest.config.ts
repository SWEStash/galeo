import { defineConfig } from 'vitest/config';
import { licences } from './build/licences.ts';

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
        // `virtual:licences`, which the About dialog loads, as the build makes it.
        plugins: [licences()],
        test: {
          name: 'renderer',
          environment: 'happy-dom',
          include: ['src/renderer/**/*.test.{ts,tsx}', 'tests/renderer/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
