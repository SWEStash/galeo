import AxeBuilder from '@axe-core/playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { appDirs, launchApp, removeTempHome, tempHome } from '../helpers/launch';
import { saveFile } from '../helpers/save';

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const basic = path.join(docs, 'basic.md');
const notes = path.join(docs, 'notes.txt');
const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const columnWidth = (window: Page) => shownDocument(window).locator('article.galeo-document').evaluate((article) => article.getBoundingClientRect().width);
const palette = (window: Page) => window.getByTestId('palette');

/** A temp home whose settings pick a theme. */
function homeWith(theme: 'light' | 'dark') {
  const home = tempHome();
  const settings = path.join(appDirs(home).config, 'settings.json');
  mkdirSync(path.dirname(settings), { recursive: true });
  saveFile(settings, `{"schemaVersion":1,"themeMode":"${theme}"}`);
  return home;
}

async function run(window: Page, query: string) {
  await window.keyboard.press('ControlOrMeta+Shift+P');
  await palette(window).getByRole('combobox').fill(query);
  await window.keyboard.press('Enter');
  await expect(palette(window)).toHaveCount(0);
}

for (const theme of ['light', 'dark'] as const) {
  test(`Alt+= widens this tab's reading column and Alt+- narrows it, the status bar says so, and passes axe (${theme})`, async () => {
    const home = homeWith(theme);
    const { window, close } = await launchApp(['--', basic, notes], { home });
    try {
      await expect(shownDocument(window).locator('h1')).toBeVisible();
      const start = await columnWidth(window);
      await window.keyboard.press('Alt+Equal');
      await expect(window.getByTestId('status-width')).toHaveText('80 ch');
      await expect.poll(() => columnWidth(window)).toBeGreaterThan(start);
      const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('.status-bar').analyze();
      expect(results.violations).toEqual([]);
      // The other tab keeps the setting.
      await window.keyboard.press('Control+Tab');
      await expect(window.getByTestId('status-view')).toHaveText('Reader');
      await expect(window.getByTestId('status-width')).toHaveCount(0);
      await window.keyboard.press('Control+Tab');
      await window.keyboard.press('Alt+Minus');
      await window.keyboard.press('Alt+Minus');
      await expect(window.getByTestId('status-width')).toHaveText('64 ch');
      await expect.poll(() => columnWidth(window)).toBeLessThan(start);
      await window.keyboard.press('Alt+0');
      await expect(window.getByTestId('status-width')).toHaveCount(0);
      await expect.poll(() => columnWidth(window)).toBe(start);
    } finally {
      await close();
      removeTempHome(home);
    }
  });
}

test('a tab set to full width from the palette keeps it across a restart', async () => {
  const home = homeWith('light');
  try {
    const first = await launchApp(['--', basic], { home });
    try {
      await expect(shownDocument(first.window).locator('h1')).toBeVisible();
      await run(first.window, 'Full width');
      await expect(first.window.getByTestId('status-width')).toHaveText('Full width');
      const session = path.join(appDirs(home).state, 'profiles', 'default', 'session.json');
      await expect.poll(() => existsSync(session) && readFileSync(session, 'utf8').includes('"width": "full"'), { timeout: 15_000 }).toBe(true);
    } finally {
      await first.close();
    }
    const second = await launchApp([], { home });
    try {
      await expect(shownDocument(second.window).locator('h1')).toBeVisible();
      await expect(second.window.getByTestId('status-width')).toHaveText('Full width');
      const view = shownDocument(second.window);
      const room = await view.evaluate((element) => element.clientWidth);
      await expect.poll(() => columnWidth(second.window)).toBeGreaterThan(room - 2);
    } finally {
      await second.close();
    }
  } finally {
    removeTempHome(home);
  }
});

test('the width keys say where they apply in a view with no reading column', async () => {
  const { window, close } = await launchApp(['--', basic]);
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+U');
    await expect(window.getByTestId('status-view')).toHaveText('Source');
    await window.keyboard.press('Alt+Equal');
    await expect(window.getByTestId('status-message')).toHaveText('Reader width applies to the rendered view');
    await expect(window.getByTestId('status-width')).toHaveCount(0);
  } finally {
    await close();
  }
});
