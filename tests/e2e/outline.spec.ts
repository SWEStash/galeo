import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from '../helpers/launch';

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const plan = path.join(docs, 'plan-50k.md');
const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const outline = (window: Page) => window.getByRole('navigation', { name: 'Outline' });
const current = (window: Page) => outline(window).locator('[aria-current="location"]');

/** How far a heading sits below the top of the document view, in pixels. */
function offsetFromTop(window: Page, text: string): Promise<number> {
  return shownDocument(window).evaluate((view, wanted) => {
    const heading = [...view.shadowRoot!.querySelectorAll('h1, h2, h3, h4, h5, h6')].find((each) => each.textContent?.includes(wanted))!;
    return heading.getBoundingClientRect().top - view.getBoundingClientRect().top;
  }, text);
}

test('Ctrl+Shift+O opens the outline on the heading being read, passes axe, and Esc gives focus back', async () => {
  const { window, close } = await launchApp(['--', plan]);
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+Shift+O');
    await expect(outline(window)).toBeVisible();
    await expect(current(window)).toHaveText('galeo — v0.1 "reader" Execution Plan');
    await expect(current(window)).toBeFocused();
    const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[data-testid="outline"]').analyze();
    expect(results.violations).toEqual([]);
    await window.keyboard.press('Escape');
    await expect(outline(window)).toHaveCount(0);
    await expect(shownDocument(window)).toBeFocused();
  } finally {
    await close();
  }
});

test('choosing a heading scrolls to it, and the current heading follows the scroll', async () => {
  const { window, close } = await launchApp(['--', plan]);
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+Shift+O');
    await outline(window).getByRole('button', { name: '9. Dependency map and critical path' }).click();
    await expect.poll(() => offsetFromTop(window, '9. Dependency map and critical path')).toBeLessThan(8);
    await expect(current(window)).toHaveText('9. Dependency map and critical path');
    // Scrolling back up: the mark follows the reader.
    await shownDocument(window).evaluate((view) => (view.scrollTop = 0));
    await expect(current(window)).toHaveText('galeo — v0.1 "reader" Execution Plan');
  } finally {
    await close();
  }
});

test('the palette toggles the outline too; a log has none', async () => {
  const { window, close } = await launchApp(['--', plan, path.join(docs, 'sample.log')]);
  try {
    await expect(window.getByRole('tab')).toHaveCount(2);
    await window.getByRole('tab').first().click();
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+Shift+P');
    await window.getByTestId('palette').getByRole('combobox').fill('outline');
    await window.keyboard.press('Enter');
    await expect(outline(window)).toBeVisible();
    // Open for the window, but a log has no headings to show.
    await window.getByRole('tab').nth(1).click();
    await expect(shownDocument(window).locator('.cm-editor')).toBeVisible();
    await expect(outline(window)).toHaveCount(0);
    await window.getByRole('tab').first().click();
    await expect(outline(window)).toBeVisible();
  } finally {
    await close();
  }
});
