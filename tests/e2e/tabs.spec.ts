import AxeBuilder from '@axe-core/playwright';
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

const five = ['basic.md', 'gfm.md', 'math.md', 'frontmatter.md', 'sample.log'].map((name) => path.join(docs, name));
const tabNames = (window: Page) => window.getByRole('tab').allTextContents();
const selected = (window: Page) => window.getByRole('tab', { selected: true });

async function withTabs(run: (window: Page) => Promise<void>) {
  const { window, close } = await launchApp(['--', ...five]);
  try {
    await expect(window.getByRole('tab')).toHaveCount(5);
    await expect(selected(window)).toContainText('basic.md');
    await run(window);
  } finally {
    await close();
  }
}

test('the tab bar is an ARIA tablist whose tabs control their panels', async () => {
  await withTabs(async (window) => {
    const list = window.getByRole('tablist', { name: 'Open documents' });
    await expect(list).toBeVisible();
    const tab = selected(window);
    const panel = window.locator(`#${await tab.getAttribute('aria-controls')}`);
    await expect(panel).toHaveAttribute('role', 'tabpanel');
    await expect(panel).toHaveAttribute('data-active', 'true');
    const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('.tab-bar').analyze();
    expect(results.violations).toEqual([]);
  });
});

test('Ctrl+Tab and Ctrl+Shift+Tab cycle through the tabs', async () => {
  await withTabs(async (window) => {
    await window.keyboard.press('Control+Tab');
    await expect(selected(window)).toContainText('gfm.md');
    await expect(shown(window).getByTestId('document')).toBeVisible();
    await window.keyboard.press('Control+Shift+Tab');
    await window.keyboard.press('Control+Shift+Tab');
    await expect(selected(window)).toContainText('sample.log');
  });
});

test('Ctrl+PgDn and Ctrl+PgUp move to the next and previous tab', async () => {
  await withTabs(async (window) => {
    await window.keyboard.press('ControlOrMeta+PageDown');
    await expect(selected(window)).toContainText('gfm.md');
    await window.keyboard.press('ControlOrMeta+PageUp');
    await expect(selected(window)).toContainText('basic.md');
  });
});

test('Ctrl+1…8 go to that tab and Ctrl+9 to the last', async () => {
  await withTabs(async (window) => {
    await window.keyboard.press('ControlOrMeta+3');
    await expect(selected(window)).toContainText('math.md');
    await window.keyboard.press('ControlOrMeta+9');
    await expect(selected(window)).toContainText('sample.log');
    await window.keyboard.press('ControlOrMeta+8');
    await expect(selected(window)).toContainText('sample.log');
  });
});

test('Ctrl+W closes the tab and shows its right neighbour; Ctrl+Shift+T brings it back', async () => {
  await withTabs(async (window) => {
    await window.keyboard.press('ControlOrMeta+2');
    await window.keyboard.press('ControlOrMeta+W');
    await expect(window.getByRole('tab')).toHaveCount(4);
    await expect(selected(window)).toContainText('math.md');
    await window.keyboard.press('ControlOrMeta+Shift+T');
    await expect(window.getByRole('tab')).toHaveCount(5);
    expect(await tabNames(window)).toEqual(five.map((file) => `${path.basename(file)}✕`));
    await expect(selected(window)).toContainText('gfm.md');
  });
});

test('Ctrl+Shift+PgUp and Ctrl+Shift+PgDn move the tab', async () => {
  await withTabs(async (window) => {
    await window.keyboard.press('ControlOrMeta+Shift+PageDown');
    await expect(window.getByRole('tab').nth(1)).toContainText('basic.md');
    await window.keyboard.press('ControlOrMeta+Shift+PageUp');
    await expect(window.getByRole('tab').nth(0)).toContainText('basic.md');
    await expect(selected(window)).toContainText('basic.md');
  });
});

test('in the tab bar, arrows move between tabs, Enter shows one and Delete closes it', async () => {
  await withTabs(async (window) => {
    await selected(window).focus();
    await window.keyboard.press('ArrowRight');
    await expect(selected(window)).toContainText('basic.md');
    await window.keyboard.press('Enter');
    await expect(selected(window)).toContainText('gfm.md');
    await window.keyboard.press('Delete');
    await expect(window.getByRole('tab')).toHaveCount(4);
    await expect(window.getByRole('tab').filter({ hasText: 'gfm.md' })).toHaveCount(0);
  });
});

test('clicking a tab shows it; its ✕ and a middle-click close it', async () => {
  await withTabs(async (window) => {
    await window.getByRole('tab').filter({ hasText: 'math.md' }).click();
    await expect(selected(window)).toContainText('math.md');
    await window.getByRole('tab').filter({ hasText: 'gfm.md' }).locator('.tab-close').click();
    await expect(window.getByRole('tab')).toHaveCount(4);
    await window.getByRole('tab').filter({ hasText: 'sample.log' }).click({ button: 'middle' });
    await expect(window.getByRole('tab')).toHaveCount(3);
    await expect(selected(window)).toContainText('math.md');
  });
});

test('dragging a tab moves it to where it is dropped', async () => {
  await withTabs(async (window) => {
    const fourth = window.getByRole('tab').nth(3);
    const box = (await fourth.boundingBox())!;
    // Past the middle of the fourth tab: the insertion point is after it.
    await window.getByRole('tab').nth(0).locator('.tab-label').dragTo(fourth, { targetPosition: { x: box.width * 0.75, y: box.height / 2 } });
    await expect.poll(() => tabNames(window)).toEqual(['gfm.md✕', 'math.md✕', 'frontmatter.md✕', 'basic.md✕', 'sample.log✕']);
    await expect(window.getByTestId('tab-caret')).toHaveCount(0);
  });
});

test('when tabs overflow, they shrink, then the strip scrolls with the shown tab in view', async () => {
  const many = Array.from({ length: 30 }, () => path.join(docs, 'basic.md'));
  const { window, close } = await launchApp(['--', ...many]);
  try {
    await expect(window.getByRole('tab')).toHaveCount(30);
    const width = await window.getByRole('tab').first().evaluate((tab) => tab.getBoundingClientRect().width);
    expect(width).toBeLessThan(200);
    await window.keyboard.press('ControlOrMeta+9');
    await expect(selected(window)).toBeInViewport();
    // However many tabs, the end of the bar still drags the window.
    const grip = window.getByTestId('window-grip');
    expect((await grip.boundingBox())!.width).toBeGreaterThanOrEqual(40);
    expect(await grip.evaluate((element) => getComputedStyle(element).getPropertyValue('-webkit-app-region'))).toBe('drag');
  } finally {
    await close();
  }
});
