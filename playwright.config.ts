import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 30_000,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  workers: 1,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'e2e', testDir: 'tests/e2e' },
    // Socket-level zero-network proof (SR-07): the app runs under strace, so it's slower.
    { name: 'no-network', testDir: 'tests/security/no-network', testMatch: '*.spec.ts', timeout: 90_000 },
    // Needs a `GALEO_PERF=1 npm run build`: only those builds carry the timing marks.
    { name: 'perf', testDir: 'tests/perf', testMatch: '*.spec.ts' },
    // One start before the e2e suite in CI: a fresh machine's first start is slow (see the spec).
    { name: 'warm-up', testDir: 'tests/warm-up', timeout: 120_000 },
  ],
});
