import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from '../helpers/launch';

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const index = path.join(docs, 'links/index.md');

const shown = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"]');
const snapshot = (page: Page) => page.evaluate(() => window.galeo.tabs.snapshot());

test('opens every file of the launch in its own tab and shows the first', async () => {
  const files = ['basic.md', 'gfm.md', 'math.md'].map((name) => path.join(docs, name));
  const { window, close } = await launchApp(['--', ...files]);
  try {
    await expect(window.getByTestId('tab-panel')).toHaveCount(3);
    await expect(shown(window)).toHaveCount(1);
    await expect(shown(window).getByTestId('document')).toBeVisible();
    const tabs = await snapshot(window);
    expect(tabs.tabs.map((tab) => tab.path)).toEqual(files);
    // The page activated the first tab and told main.
    await expect.poll(async () => (await snapshot(window)).active).toBe(tabs.tabs[0]!.id);
  } finally {
    await close();
  }
});

test('Ctrl+click opens a local link in a new tab behind this one', async () => {
  const { window, close } = await launchApp(['--', index]);
  try {
    await expect(shown(window).locator('h1')).toHaveText('Links index');
    await shown(window).getByTestId('document').getByRole('link', { name: 'Other document' }).click({ modifiers: ['ControlOrMeta'] });
    await expect(window.getByTestId('tab-panel')).toHaveCount(2);
    const tabs = await snapshot(window);
    expect(tabs.tabs.map((tab) => path.basename(tab.path))).toEqual(['index.md', 'other.md']);
    expect(tabs.active).toBe(tabs.tabs[0]!.id);
    await expect(shown(window).locator('h1')).toHaveText('Links index');
  } finally {
    await close();
  }
});
