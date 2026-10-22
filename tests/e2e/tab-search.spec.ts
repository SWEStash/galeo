import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from '../helpers/launch';

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const four = ['basic.md', 'gfm.md', 'math.md', 'frontmatter.md'].map((name) => path.join(docs, name));

const tabSearch = (window: Page) => window.getByTestId('tab-search');
const field = (window: Page) => tabSearch(window).getByRole('combobox');
const group = (window: Page, name: string) => tabSearch(window).getByRole('group', { name });
const selected = (window: Page) => window.getByRole('tab', { selected: true });
const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const snapshot = (page: Page) => page.evaluate(() => window.galeo.tabs.snapshot());

async function withTabs(run: (window: Page) => Promise<void>) {
  const { window, close } = await launchApp(['--', ...four]);
  try {
    await expect(window.getByRole('tab')).toHaveCount(4);
    await expect(selected(window)).toContainText('basic.md');
    await run(window);
  } finally {
    await close();
  }
}

async function openTabSearch(window: Page) {
  await window.keyboard.press('ControlOrMeta+Shift+A');
  await expect(field(window)).toBeFocused();
}

test('Ctrl+Shift+A lists the open and recently closed tabs, passes axe, and Esc gives focus back', async () => {
  await withTabs(async (window) => {
    await window.keyboard.press('ControlOrMeta+3');
    await window.keyboard.press('ControlOrMeta+W');
    await expect(window.getByRole('tab')).toHaveCount(3);
    await openTabSearch(window);
    await expect(group(window, 'Open tabs').getByRole('option')).toHaveCount(3);
    await expect(group(window, 'Recently closed').getByRole('option')).toHaveCount(1);
    await expect(group(window, 'Recently closed').getByRole('option')).toContainText('math.md');
    const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[data-testid="tab-search"]').analyze();
    expect(results.violations).toEqual([]);
    await window.keyboard.press('Escape');
    await expect(tabSearch(window)).toHaveCount(0);
    await expect(shownDocument(window)).toBeFocused();
  });
});

test('typing narrows the list; Enter shows an open tab', async () => {
  await withTabs(async (window) => {
    await openTabSearch(window);
    await field(window).fill('front');
    await expect(tabSearch(window).getByRole('option')).toHaveCount(1);
    await window.keyboard.press('Enter');
    await expect(tabSearch(window)).toHaveCount(0);
    await expect(selected(window)).toContainText('frontmatter.md');
    await expect(window.getByRole('tab')).toHaveCount(4);
    await expect(shownDocument(window)).toBeFocused();
  });
});

test('Enter on a closed tab reopens it where it was, with its zoom', async () => {
  await withTabs(async (window) => {
    await window.keyboard.press('ControlOrMeta+2');
    await expect(selected(window)).toContainText('gfm.md');
    await window.keyboard.press('ControlOrMeta+=');
    await expect.poll(async () => (await snapshot(window)).tabs[1]!.zoom).toBeGreaterThan(1);
    await window.keyboard.press('ControlOrMeta+W');
    await window.keyboard.press('ControlOrMeta+3');
    await expect(selected(window)).toContainText('frontmatter.md');
    await window.keyboard.press('ControlOrMeta+W');
    await expect(window.getByRole('tab')).toHaveCount(2);

    // The older of the two closed tabs: Ctrl+Shift+T would bring back the other.
    await openTabSearch(window);
    await field(window).fill('gfm');
    // Matching takes the whole path, so the fixtures' folder lets other tabs match too: gfm.md ranks first.
    const closed = group(window, 'Recently closed').getByRole('option');
    await expect(closed.first()).toContainText('gfm.md');
    for (let n = 0; n < 10 && (await closed.first().getAttribute('data-focused')) !== 'true'; n++) await field(window).press('ArrowDown');
    await expect(closed.first()).toHaveAttribute('data-focused', 'true');
    await window.keyboard.press('Enter');
    await expect(window.getByRole('tab')).toHaveCount(3);
    await expect(window.getByRole('tab').nth(1)).toContainText('gfm.md');
    await expect(selected(window)).toContainText('gfm.md');
    const reopened = (await snapshot(window)).tabs[1]!;
    expect(reopened.path).toBe(four[1]);
    expect(reopened.zoom).toBeGreaterThan(1);

    await openTabSearch(window);
    await expect(group(window, 'Recently closed').getByRole('option')).toHaveCount(1);
    await expect(group(window, 'Recently closed').getByRole('option')).toContainText('frontmatter.md');
  });
});

test('the palette opens it too, and Home and End move the caret in its field', async () => {
  await withTabs(async (window) => {
    await window.keyboard.press('ControlOrMeta+Shift+P');
    await window.getByTestId('palette').getByRole('combobox').fill('Search tabs');
    await window.keyboard.press('Enter');
    await expect(field(window)).toBeFocused();
    await field(window).fill('md');
    await field(window).press('ArrowDown');
    const caret = () => field(window).evaluate((input: HTMLInputElement) => input.selectionStart);
    await field(window).press('Home');
    expect(await caret()).toBe(0);
    await field(window).press('End');
    expect(await caret()).toBe(2);
  });
});
