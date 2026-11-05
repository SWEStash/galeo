import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, removeTempHome, tempHome } from '../helpers/launch';
import { saveFile } from '../helpers/save';
import { checkBudget, summarize } from './stats';

const budgets = (await import('./budgets.json', { with: { type: 'json' } })).default as { changeMarksMs: number };
const factor = process.env['GALEO_PERF_ENFORCE'] === '1' ? 1 : 3;
const RUNS = 5;
const EDITS = 50;

/** About 1 MB of Markdown: a long plan, one paragraph per step. */
const steps = Array.from({ length: 9_000 }, (_, n) => `Step ${n + 1}: ${'check the build, then the tests, then the package. '.repeat(2)}`);
const plan = (lines: string[]) => `# Plan\n\n${lines.join('\n\n')}\n`;

test('coming back to a 1 MB plan with 50 scattered changes adds its marks within the budget of the new text showing', async () => {
  const dir = tempHome();
  const file = path.join(dir, 'plan.md');
  const other = path.join(dir, 'other.md');
  let current = [...steps];
  saveFile(file, plan(current));
  saveFile(other, '# Other\n');
  const { window, close } = await launchApp(['--', file, other], { home: dir });
  try {
    const tab = (name: string) => window.getByRole('tab', { name: new RegExp(`^${name}`) });
    const shown = window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
    await tab('plan.md').click();
    // The plan's first render takes seconds on a busy machine; the timing starts later.
    await expect(shown.locator('p').first()).toBeAttached({ timeout: 20_000 });
    const samples: number[] = [];
    // When the new text shows, before marks: the reread and render a change costs without them.
    const textShown: number[] = [];
    for (let run = 0; run < RUNS; run++) {
      await tab('other.md').click();
      await expect(shown.locator('h1')).toHaveText('Other');
      // 50 edits spread through the plan, different on every run.
      current = current.map((step, n) => (n % Math.floor(current.length / EDITS) === run ? `${step} (edited ${run})` : step));
      saveFile(file, plan(current));
      await expect(tab('plan.md')).toHaveAccessibleName(/changed on disk/);
      const start = Date.now();
      await tab('plan.md').click();
      await expect(shown.locator('p', { hasText: `(edited ${run})` }).first()).toBeAttached({ timeout: 20_000 });
      textShown.push(Date.now() - start);
      await expect(shown.locator('p.galeo-changed')).toHaveCount(EDITS, { timeout: 20_000 });
      samples.push(Date.now() - start);
    }
    // The marks' own cost: from the new text showing to all its marks drawn (the diff, then marking).
    const summary = summarize(samples.map((at, run) => at - textShown[run]!));
    const out = path.join(import.meta.dirname, 'results');
    mkdirSync(out, { recursive: true });
    writeFileSync(
      path.join(out, 'change-marks.json'),
      `${JSON.stringify({ metric: 'change-marks', measuredAt: new Date().toISOString(), platform: process.platform, ci: Boolean(process.env['CI']), changeMarksMs: summary, textShownMs: summarize(textShown), marksShownMs: summarize(samples) }, null, 2)}\n`,
    );
    console.log(`change-marks: ${EDITS} marks after the new text, median ${summary.median.toFixed(0)} ms (min ${summary.min}, max ${summary.max}); new text shown, median ${summarize(textShown).median.toFixed(0)} ms`);
    const verdict = checkBudget(summary, budgets.changeMarksMs, factor);
    expect(summary.median, `over the ${verdict.limit} ms limit`).toBeLessThanOrEqual(verdict.limit);
  } finally {
    await close();
    removeTempHome(dir);
  }
});
