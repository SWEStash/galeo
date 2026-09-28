import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, tempHome } from '../helpers/launch';

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const plan = path.join(docs, 'plan-50k.md');
const documents = (window: Page) => window.getByTestId('document');
const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');

test('keeps three tabs warm besides the shown one, and hibernates the least recently shown', async () => {
  const files = ['basic.md', 'gfm.md', 'math.md', 'frontmatter.md', 'sample.log'].map((name) => path.join(docs, name));
  const { window, close } = await launchApp(['--', ...files]);
  try {
    await expect(documents(window)).toHaveCount(1);
    for (let shown = 2; shown <= 5; shown++) {
      await window.keyboard.press('Control+Tab');
      await expect(shownDocument(window)).toBeVisible();
    }
    // basic.md was shown longest ago: hibernated, its document gone.
    await expect(documents(window)).toHaveCount(4);
    const panel = window.locator('[data-testid="tab-panel"]').first();
    await expect(panel.getByTestId('document')).toHaveCount(0);
  } finally {
    await close();
  }
});

test('a hibernated tab wakes where the reader left it, with no visible jump', async () => {
  // No warm tabs: switching away hibernates the tab at once.
  const home = tempHome();
  mkdirSync(path.join(home, 'config', 'galeo'), { recursive: true });
  writeFileSync(path.join(home, 'config', 'galeo', 'settings.json'), '{"schemaVersion":1,"warmTabs":0}');
  const { window, close } = await launchApp(['--', plan, path.join(docs, 'basic.md')], { home });
  try {
    const view = shownDocument(window);
    await expect(view.locator('h2').nth(5)).toBeVisible();
    await view.evaluate((element) => {
      element.scrollTop = element.scrollHeight * 0.6;
    });
    await expect(view).toHaveAttribute('data-position-line', /\d+/);
    const left = await view.evaluate((element) => element.scrollTop);

    await window.keyboard.press('Control+Tab');
    await expect(documents(window)).toHaveCount(1);
    // Record the scroll position at the moment the woken document becomes visible.
    await window.evaluate(() => {
      const seen: number[] = [];
      (window as { __galeoRevealedAt?: number[] }).__galeoRevealedAt = seen;
      new MutationObserver((changes) => {
        for (const change of changes) {
          const element = change.target as HTMLElement;
          if (element.dataset['testid'] === 'document' && !element.hasAttribute('data-waking')) seen.push(element.scrollTop);
        }
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-waking'] });
    });
    await window.keyboard.press('Control+Tab');
    await expect(view.locator('h2').first()).toBeAttached();
    await expect(view).not.toHaveAttribute('data-waking');
    const revealedAt = await window.evaluate(() => (window as { __galeoRevealedAt?: number[] }).__galeoRevealedAt ?? []);
    expect(revealedAt).toHaveLength(1);
    expect(Math.abs(revealedAt[0]! - left)).toBeLessThanOrEqual(2);
    expect(Math.abs((await view.evaluate((element) => element.scrollTop)) - left)).toBeLessThanOrEqual(2);
  } finally {
    await close();
    rmSync(home, { recursive: true, force: true });
  }
});

test('a warm tab whose file changed while hidden is read again when shown', async () => {
  const dir = tempHome();
  const first = path.join(dir, 'first.md');
  const second = path.join(dir, 'second.md');
  writeFileSync(first, '# Before\n');
  writeFileSync(second, '# Second\n');
  const { window, close } = await launchApp(['--', first, second]);
  try {
    await expect(shownDocument(window).locator('h1')).toHaveText('Before');
    await window.keyboard.press('Control+Tab');
    await expect(shownDocument(window).locator('h1')).toHaveText('Second');
    writeFileSync(first, '# After, and longer\n');
    await window.keyboard.press('Control+Tab');
    await expect(shownDocument(window).locator('h1')).toHaveText('After, and longer');
  } finally {
    await close();
    rmSync(dir, { recursive: true, force: true });
  }
});
