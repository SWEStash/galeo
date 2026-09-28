import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, tempHome } from '../helpers/launch';
import { checkBudget, summarize } from './stats';

const RUNS = 10;
const ROOT = path.resolve(import.meta.dirname, '../..');
const budgets = (await import('./budgets.json', { with: { type: 'json' } })).default as { warmSwitchMs: number; wakeMs: number };
const factor = process.env['GALEO_PERF_ENFORCE'] === '1' ? 1 : 3;
/** The 50 KB reference document and a short one to switch between. */
const FILES = ['tests/fixtures/docs/plan-50k.md', 'tests/fixtures/docs/basic.md'].map((file) => path.join(ROOT, file));

/**
 * Presses Ctrl+Tab and counts the time until the other tab shows its content, checked every
 * frame: the result is frame-accurate, which is what "within the next frame" is about.
 */
function switchTab(page: Page): Promise<{ ms: number; target: number }> {
  return page.evaluate(async () => {
    const panels = () => [...document.querySelectorAll<HTMLElement>('[data-testid="tab-panel"]')];
    const target = panels().findIndex((panel) => panel.dataset['active'] !== 'true');
    const start = performance.now();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true, cancelable: true }));
    for (;;) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const panel = panels()[target]!;
      const view = panel.querySelector<HTMLElement>('[data-testid="document"]');
      const shown = panel.dataset['active'] === 'true' && view && !view.hasAttribute('data-waking');
      if (shown && view.shadowRoot?.querySelector('article')?.childElementCount) return { ms: performance.now() - start, target };
    }
  });
}

async function measure(warmTabs: number): Promise<number[]> {
  const home = tempHome();
  mkdirSync(path.join(home, 'config', 'galeo'), { recursive: true });
  writeFileSync(path.join(home, 'config', 'galeo', 'settings.json'), JSON.stringify({ schemaVersion: 1, warmTabs }));
  const { window, close } = await launchApp(['--', ...FILES], { home });
  try {
    await expect(window.getByTestId('tab-panel')).toHaveCount(2);
    await expect(window.locator('[data-testid="document"]').first()).toBeVisible();
    // Show both once, so each has been rendered before measuring.
    await switchTab(window);
    await switchTab(window);
    // Only switches to the 50 KB reference (the first tab) count.
    const samples: number[] = [];
    while (samples.length < RUNS) {
      const { ms, target } = await switchTab(window);
      if (target === 0) samples.push(ms);
    }
    return samples;
  } finally {
    await close();
    rmSync(home, { recursive: true, force: true });
  }
}

function report(name: string, samples: number[], budgetMs: number) {
  const summary = summarize(samples);
  const dir = path.join(import.meta.dirname, 'results');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, `${name}.json`),
    `${JSON.stringify({ metric: name, measuredAt: new Date().toISOString(), platform: process.platform, ci: Boolean(process.env['CI']), budgetFactor: factor, ms: summary }, null, 2)}\n`,
  );
  console.log(`${name}: median ${summary.median.toFixed(1)} ms, p95 ${summary.p95.toFixed(1)} ms (n=${summary.n})`);
  const verdict = checkBudget(summary, budgetMs, factor);
  expect(summary.median, `median over the ${verdict.limit} ms limit`).toBeLessThanOrEqual(verdict.limit);
}

test('switching to a warm tab shows it within the next frame', async () => {
  test.setTimeout(60_000);
  report('tab-warm-switch', await measure(3), budgets.warmSwitchMs);
});

// The worker's parse cache (by content hash) usually still holds a woken tab's render, as it does
// here: this is a wake as readers meet it, not a first render.
test('waking a hibernated 50 KB tab shows it within the budget', async () => {
  test.setTimeout(60_000);
  report('tab-wake', await measure(0), budgets.wakeMs);
});
