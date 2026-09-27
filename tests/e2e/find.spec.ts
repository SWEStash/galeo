import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from '../helpers/launch';

const plan = path.resolve(import.meta.dirname, '../fixtures/docs/plan-50k.md');

async function openFind(window: Page, query: string) {
  await window.keyboard.press('Control+F');
  const input = window.getByRole('searchbox', { name: 'Find in document' });
  await expect(input).toBeFocused();
  await input.fill(query);
  return input;
}

const status = (window: Page) => window.locator('.find-bar [role="status"]');

/** The rendered highlight registry, from inside the page. */
const highlights = (window: Page) =>
  window.evaluate(() => ({ all: CSS.highlights.get('galeo-find')?.size ?? 0, current: CSS.highlights.get('galeo-find-current')?.size ?? 0 }));

test('finds in the rendered view: counts, steps with Enter and F3, and Esc keeps the place', async () => {
  const { window, close } = await launchApp(['--', plan]);
  try {
    await expect(window.getByTestId('document').locator('h1')).toBeVisible();
    const input = await openFind(window, 'mermaid');
    await expect(status(window)).toHaveText(/^1 of (\d+)$/);
    const total = Number((await status(window).textContent())!.split(' of ')[1]);
    expect(total).toBeGreaterThan(2);
    expect(await highlights(window)).toEqual({ all: total, current: 1 });

    await input.press('Enter');
    await expect(status(window)).toHaveText(`2 of ${total}`);
    await window.keyboard.press('F3');
    await expect(status(window)).toHaveText(`3 of ${total}`);
    await input.press('Shift+Enter');
    await expect(status(window)).toHaveText(`2 of ${total}`);

    const scrolled = await window.getByTestId('document').evaluate((element) => element.scrollTop);
    expect(scrolled).toBeGreaterThan(0);
    await input.press('Escape');
    await expect(window.locator('.find-bar')).toHaveCount(0);
    await expect(window.getByTestId('document')).toBeFocused();
    expect(await window.getByTestId('document').evaluate((element) => element.scrollTop)).toBe(scrolled);
    expect(await highlights(window)).toEqual({ all: 0, current: 0 });
  } finally {
    await close();
  }
});

test('finds in the source view with the same bar, and matching case narrows it', async () => {
  const { window, close } = await launchApp(['--', plan]);
  try {
    await expect(window.getByTestId('document').locator('h1')).toBeVisible();
    await window.keyboard.press('Control+U');
    await expect(window.getByTestId('document').locator('.cm-editor')).toBeVisible();
    await openFind(window, 'mermaid');
    await expect(status(window)).toHaveText(/^1 of \d+$/);
    const all = Number((await status(window).textContent())!.split(' of ')[1]);
    await expect(window.getByTestId('document').locator('.cm-searchMatch').first()).toBeVisible();
    await window.getByRole('button', { name: 'Match case' }).click();
    await expect(status(window)).toHaveText(/ of \d+$/);
    const cased = Number((await status(window).textContent())!.split(' of ')[1]);
    expect(cased).toBeLessThan(all);
  } finally {
    await close();
  }
});

test('the find bar has no accessibility violations', async () => {
  const { window, close } = await launchApp(['--', plan]);
  try {
    await expect(window.getByTestId('document').locator('h1')).toBeVisible();
    await openFind(window, 'plan');
    // Legacy mode runs in the page itself: Electron can't open the helper page axe uses for frames.
    const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('.find-bar').analyze();
    expect(results.violations).toEqual([]);
  } finally {
    await close();
  }
});
