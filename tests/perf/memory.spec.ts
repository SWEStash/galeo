import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, launchSecond } from '../helpers/launch';
import { summarize } from './stats';

const RUNS = 3;
const DOCS = path.resolve(import.meta.dirname, '../fixtures/docs');
const BASELINE = path.join(import.meta.dirname, 'memory-baseline.json');
// The release check (GALEO_PERF_ENFORCE=1, on the owner's machine) fails 10 % over the committed
// baseline; other runs only report.
const enforce = process.env['GALEO_PERF_ENFORCE'] === '1';

/** The reference workload (PRD): 3 profiles, 20 tabs, a window each; at most 3 warm per window. */
const PROFILES: [profile: string | null, files: string[]][] = [
  [null, ['plan-50k.md', 'gfm.md', 'math.md', 'mermaid.md', 'basic.md', 'frontmatter.md', 'sample.log']],
  ['acme', ['plan-50k.md', 'heavy-diagrams.md', 'gfm.md', 'math.md', 'basic.md', 'notes.txt', 'sample.log']],
  ['beta', ['plan-50k.md', 'mermaid.md', 'gfm.md', 'math.md', 'basic.md', 'frontmatter.md']],
];

/** Shows every tab of the window in turn, so its warm budget fills the way reading would. */
async function visitTabs(window: Page, count: number) {
  await expect(window.getByRole('tab')).toHaveCount(count);
  for (const tab of await window.getByRole('tab').all()) {
    await tab.click();
    await expect(window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]').locator('article > *, .cm-editor').first()).toBeVisible();
  }
}

async function measureOnce(): Promise<number> {
  const [first, ...others] = PROFILES;
  const { app, window, home, close } = await launchApp(['--', ...first![1].map((file) => path.join(DOCS, file))]);
  try {
    await visitTabs(window, first![1].length);
    for (const [profile, files] of others) {
      const opened = app.waitForEvent('window');
      launchSecond(home, ['--profile', profile!, '--', ...files.map((file) => path.join(DOCS, file))]);
      await visitTabs(await opened, files.length);
    }
    // Let lazy work (diagrams, highlighting, collected garbage) settle before reading.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const kilobytes = await app.evaluate(({ app: electron }) => electron.getAppMetrics().reduce((sum, metric) => sum + metric.memory.workingSetSize, 0));
    return kilobytes / 1024;
  } finally {
    await close();
  }
}

test('memory at the reference workload: 3 profiles, 20 tabs', async () => {
  test.setTimeout(RUNS * 120_000);
  const runs: number[] = [];
  for (let run = 0; run < RUNS; run++) runs.push(await measureOnce());
  const memoryMB = summarize(runs);
  const dir = path.join(import.meta.dirname, 'results');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'memory.json'),
    `${JSON.stringify({ metric: 'memory-reference-workload', measuredAt: new Date().toISOString(), platform: process.platform, ci: Boolean(process.env['CI']), memoryMB }, null, 2)}\n`,
  );
  console.log(`memory, 3 profiles / 20 tabs: median ${memoryMB.median.toFixed(0)} MB (n=${memoryMB.n}, ${memoryMB.min.toFixed(0)}–${memoryMB.max.toFixed(0)})`);
  if (enforce && existsSync(BASELINE)) {
    const baseline = (JSON.parse(readFileSync(BASELINE, 'utf8')) as { memoryMB: number }).memoryMB;
    expect(memoryMB.median, `over 10 % above the ${baseline} MB baseline`).toBeLessThanOrEqual(baseline * 1.1);
  }
});
