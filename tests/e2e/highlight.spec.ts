import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { appDirs, launchApp, removeTempHome, tempHome } from '../helpers/launch';
import { saveFile } from '../helpers/save';

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');

const TYPESCRIPT = ['// Sums a list.', 'export function total(values: number[]): number {', '  let sum = 0;', '  for (const value of values) sum += value;', '  return sum;', '}', ''].join('\n');
const JSON_TEXT = ['{', '  "name": "galeo",', '  "items": [1, 2, 3],', '  "nested": { "ok": true, "none": null }', '}', ''].join('\n');

/** The colour of the first source text that reads `text`, or null when none does. */
function colourOf(window: Page, text: string): Promise<string | null> {
  return shownDocument(window).evaluate((view, wanted) => {
    const span = [...view.shadowRoot!.querySelectorAll('.cm-line span')].find((each) => each.textContent === wanted);
    return span ? getComputedStyle(span).color : null;
  }, text);
}

const visibleLines = (window: Page) => shownDocument(window).locator('.cm-line').count();

/** A home with the theme mode set, and a folder of sample files. */
function setUp(theme: 'light' | 'dark') {
  const home = tempHome();
  const settings = path.join(appDirs(home).config, 'settings.json');
  mkdirSync(path.dirname(settings), { recursive: true });
  saveFile(settings, `{"schemaVersion":1,"themeMode":"${theme}"}`);
  const files = path.join(home, 'files');
  mkdirSync(files);
  writeFileSync(path.join(files, 'total.ts'), TYPESCRIPT);
  writeFileSync(path.join(files, 'data.json'), JSON_TEXT);
  return { home, ts: path.join(files, 'total.ts'), json: path.join(files, 'data.json') };
}

for (const [theme, keyword] of [['light', 'rgb(207, 34, 46)'], ['dark', 'rgb(255, 123, 114)']] as const) {
  test(`source code, JSON, YAML and TOML open highlighted, with fold markers, and pass axe (${theme})`, async () => {
    const { home, ts, json } = setUp(theme);
    const { window, close } = await launchApp(['--', ts, json, path.join(docs, 'settings.yaml'), path.join(docs, 'Cargo.toml')], { home });
    try {
      await expect(window.getByRole('tab')).toHaveCount(4);
      const expected = { 'total.ts': 'function', 'data.json': '"name"', 'settings.yaml': 'name', 'Cargo.toml': '[server]' } as const;
      for (const [index, [name, token]] of Object.entries(expected).entries()) {
        await window.getByRole('tab').nth(index).click();
        await expect(window.getByRole('tab', { selected: true })).toContainText(name);
        await expect.poll(() => colourOf(window, token), { message: `${name}: ${token} is highlighted` }).not.toBeNull();
        await expect(shownDocument(window).locator('.cm-foldGutter')).toBeAttached();
        const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[data-testid="tab-panel"][data-active="true"]').analyze();
        expect(results.violations, name).toEqual([]);
      }
      await window.getByRole('tab').first().click();
      await expect.poll(() => colourOf(window, 'function')).toBe(keyword);
    } finally {
      await close();
      removeTempHome(home);
    }
  });
}

test('Ctrl+Shift+[ folds the block at the cursor and Ctrl+Shift+] unfolds it; edit mode keeps the highlighting', async () => {
  const { home, ts } = setUp('light');
  const { app, window, close } = await launchApp(['--', ts], { home });
  try {
    await expect.poll(() => colourOf(window, 'function')).not.toBeNull();
    const lines = await visibleLines(window);
    await shownDocument(window).locator('.cm-line').nth(1).click();
    await window.keyboard.press('Control+Shift+BracketLeft');
    await expect.poll(() => visibleLines(window)).toBeLessThan(lines);
    await window.keyboard.press('Control+Shift+BracketRight');
    await expect.poll(() => visibleLines(window)).toBe(lines);

    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Editing');
    await window.keyboard.press('Control+End');
    await window.keyboard.type('const answer = 42;');
    await expect.poll(() => colourOf(window, 'const')).toBe('rgb(207, 34, 46)');
    await expect.poll(() => colourOf(window, '42')).toBe('rgb(5, 80, 174)');
    // Saved, so closing doesn't stop at the unsaved-changes question.
    await window.keyboard.press('Control+s');
    await expect(window.getByTestId('status-message')).toHaveText('Saved');
  } finally {
    await close();
    removeTempHome(home);
  }
});
