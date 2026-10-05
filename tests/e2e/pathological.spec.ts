import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { PATHOLOGICAL } from '../fixtures/gen/pathological';
import { launchApp } from '../helpers/launch';

const fixture = (name: string) => path.resolve(import.meta.dirname, '../fixtures/docs', name);
const shownPanel = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"]');

let dir: string;
test.beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'galeo-pathological-'));
});
test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(name: string): string {
  const file = path.join(dir, name);
  writeFileSync(file, PATHOLOGICAL[name]!());
  return file;
}

/** How long the page takes to run a frame, in ms. */
async function frameDelay(window: Page): Promise<number> {
  const start = Date.now();
  await window.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  return Date.now() - start;
}

/** What the shown tab ended as: rendered, or source after a failed render. Undefined until then. */
function settled(window: Page): Promise<'rendered' | 'failed' | undefined> {
  return shownPanel(window).evaluate((panel) => {
    if (panel.querySelector('[data-banner="render-slow"], [data-banner="render-failed"]')) return 'failed';
    const document = panel.querySelector('[data-testid="document"]')?.shadowRoot;
    // The article is there (empty) from the start; the loading skeleton only after 150 ms.
    if (panel.querySelector('[data-testid="document-loading"]') || !document?.querySelector('article')?.hasChildNodes()) return undefined;
    if ([...document.querySelectorAll('.galeo-diagram')].some((diagram) => diagram.getAttribute('data-state') === 'pending')) return undefined;
    return 'rendered';
  });
}

test('a document the worker cannot finish in time shows its source, and the window keeps working', async () => {
  const { window, close } = await launchApp(['--', write('nested-lists.md'), fixture('basic.md')]);
  try {
    // The worker is stuck on the first tab; the page itself still draws frames.
    await expect(shownPanel(window).getByTestId('document-loading')).toBeVisible();
    expect(await frameDelay(window)).toBeLessThan(500);
    await expect(shownPanel(window).locator('[data-banner="render-slow"]')).toBeVisible({ timeout: 10_000 });
    await expect(shownPanel(window).getByTestId('document').locator('.cm-editor')).toBeVisible();
    // A fresh worker renders the next document.
    await window.keyboard.press('Control+Tab');
    await expect(shownPanel(window).getByTestId('document').locator('article h1')).toBeVisible();
  } finally {
    await close();
  }
});

test('a large document shown as source after its budget renders once the reader asks', async () => {
  const file = path.join(dir, 'big-prose.md');
  // About 1 MB of ordinary prose: a few seconds of work, over the automatic budget.
  writeFileSync(file, 'Lorem ipsum dolor sit amet, *consectetur* adipiscing `elit`.\n\n'.repeat(16_000));
  const { window, close } = await launchApp(['--', file]);
  try {
    const banner = shownPanel(window).locator('[data-banner="render-slow"]');
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await banner.getByRole('button', { name: 'Render anyway' }).click();
    await expect(shownPanel(window).getByTestId('document').locator('article p').first()).toBeVisible({ timeout: 60_000 });
    await expect(banner).toHaveCount(0);
  } finally {
    await close();
  }
});

test('every pathological document ends rendered or as source, within the budget', async () => {
  const names = Object.keys(PATHOLOGICAL);
  const { window, close } = await launchApp(['--', ...names.map(write)]);
  const outcomes: Record<string, string> = {};
  // The page's longest stall per document (the worker's work never blocks it).
  await window.evaluate(() => {
    const w = window as { __galeoLongest?: number };
    w.__galeoLongest = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__galeoLongest = Math.max(w.__galeoLongest ?? 0, entry.duration);
    }).observe({ type: 'longtask' });
  });
  const longest = () => window.evaluate(() => (window as { __galeoLongest?: number }).__galeoLongest ?? 0);
  const resetLongest = () => window.evaluate(() => ((window as { __galeoLongest?: number }).__galeoLongest = 0));
  try {
    for (const name of names) {
      await resetLongest();
      await expect(window.getByRole('tab', { selected: true })).toContainText(name);
      const start = Date.now();
      await expect.poll(() => settled(window), { timeout: 15_000 }).not.toBeUndefined();
      const stall = await longest();
      outcomes[name] = `${await settled(window)} in ${Date.now() - start} ms, longest task ${Math.round(stall)} ms`;
      // Diagram layout and the source view's highlighting run on the page; nothing may freeze it for long.
      expect(stall, name).toBeLessThan(1500);
      // The 2 s budget, plus reading, posting and drawing the result on a busy machine.
      expect(Date.now() - start, name).toBeLessThan(8_000);
      expect(await frameDelay(window), name).toBeLessThan(500);
      await window.keyboard.press('Control+Tab');
    }
  } finally {
    console.log(JSON.stringify(outcomes, null, 1));
    await close();
  }
});

test('a file over the read limit is refused without being read', async () => {
  const file = path.join(dir, 'huge.log');
  // Sparse: 300 MB on paper, nothing on disk.
  writeFileSync(file, '');
  truncateSync(file, 300 * 1024 * 1024);
  const { window, close } = await launchApp(['--', file]);
  try {
    const state = window.getByTestId('document-state');
    await expect(state).toHaveAttribute('data-state', 'too-large');
    await expect(state.locator('.document-state-title')).toHaveText('This file is too large to open');
  } finally {
    await close();
  }
});
