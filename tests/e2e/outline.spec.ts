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
    await expect(current(window)).toHaveText('Harbor — v1 "catalogue" Execution Plan');
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
    await expect(current(window)).toHaveText('Harbor — v1 "catalogue" Execution Plan');
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

/** How far the source line that starts with `text` sits below the top of the source view, in pixels. */
function lineOffsetFromTop(window: Page, text: string): Promise<number> {
  return shownDocument(window).evaluate((view, wanted) => {
    const scroller = view.shadowRoot!.querySelector('.cm-scroller')!;
    const line = [...view.shadowRoot!.querySelectorAll('.cm-line')].find((each) => each.textContent?.startsWith(wanted));
    return line ? line.getBoundingClientRect().top - scroller.getBoundingClientRect().top : Infinity;
  }, text);
}

test("a YAML file's outline lists its top-level keys; choosing one scrolls the source to it, and the mark follows", async () => {
  const { window, close } = await launchApp(['--', path.join(docs, 'settings.yaml')]);
  try {
    await expect(shownDocument(window).locator('.cm-content')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+Shift+O');
    await expect(outline(window).getByRole('button')).toHaveText(['name', 'version', 'server', 'database', 'cache', 'queue', 'storage', 'mail', 'search', 'metrics', 'tracing', 'logging', 'auth', 'billing', 'reports', 'exports', 'imports', 'webhooks', 'scheduler', 'workers', 'features', 'limits']);
    await expect(current(window)).toHaveText('name');
    const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[data-testid="outline"]').analyze();
    expect(results.violations).toEqual([]);
    await outline(window).getByRole('button', { name: 'webhooks' }).click();
    await expect.poll(() => lineOffsetFromTop(window, 'webhooks:')).toBeLessThan(8);
    await expect(current(window)).toHaveText('webhooks');
  } finally {
    await close();
  }
});

test("a TOML file's outline lists its root keys and tables", async () => {
  const { window, close } = await launchApp(['--', path.join(docs, 'Cargo.toml')]);
  try {
    await expect(shownDocument(window).locator('.cm-content')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+Shift+O');
    const entries = outline(window).getByRole('button');
    await expect(entries.first()).toHaveText('title');
    await expect(entries).toHaveCount(2 + 20 + 2);
    await expect(entries.last()).toHaveText('[[bin]]');
  } finally {
    await close();
  }
});
