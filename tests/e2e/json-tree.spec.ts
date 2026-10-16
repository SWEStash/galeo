import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { launchApp, removeTempHome, tempHome } from '../helpers/launch';

const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const tree = (window: Page) => shownDocument(window).locator('[role=tree]');
const rows = (window: Page) => shownDocument(window).locator('[role=treeitem]');
const banner = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document-banner"]');
const palette = (window: Page) => window.getByTestId('palette');

/** A temp home with these files in it; `files[name]` is each one's path. */
function setUp(contents: Record<string, string>) {
  const home = tempHome();
  const folder = path.join(home, 'files');
  mkdirSync(folder);
  const files: Record<string, string> = {};
  for (const [name, text] of Object.entries(contents)) writeFileSync((files[name] = path.join(folder, name)), text);
  return { home, files };
}

async function runCommand(window: Page, label: string) {
  await window.keyboard.press('ControlOrMeta+Shift+P');
  await palette(window).getByRole('combobox').fill(label);
  await window.keyboard.press('Enter');
  await expect(palette(window)).toHaveCount(0);
}

const clipboardText = (app: ElectronApplication) => app.evaluate(({ clipboard }) => clipboard.readText());

const SAMPLE = JSON.stringify({ name: 'galeo', items: [{ id: 1 }, { id: 2 }], 'odd key': { ok: true } }, null, 2);

test('a .json file opens as a tree with its top level shown, and the tree keys follow the ARIA tree pattern', async () => {
  const { home, files } = setUp({ 'data.json': SAMPLE });
  const { window, close } = await launchApp(['--', files['data.json']!], { home });
  try {
    await expect(tree(window)).toHaveAttribute('aria-label', 'data.json');
    await expect(rows(window)).toHaveText(['{3 keys}', 'name: "galeo"', 'items: [2 items]', 'odd key: {1 key}'].map((text) => new RegExp(`${text.replace(/[[\]{}$]/g, '\\$&')}$`)));
    await expect(window.getByTestId('status-view')).toHaveText('Tree');
    // A click focuses the row; → opens it, then steps into it.
    await rows(window).nth(2).click();
    await expect(rows(window)).toHaveCount(4);
    await window.keyboard.press('ArrowRight');
    await expect(rows(window)).toHaveCount(6);
    await window.keyboard.press('ArrowRight');
    await expect(rows(window).nth(3)).toBeFocused();
    await window.keyboard.press('ArrowLeft');
    await expect(rows(window).nth(2)).toBeFocused();
    await window.keyboard.press('ArrowLeft');
    await expect(rows(window)).toHaveCount(4);
    await window.keyboard.press('End');
    await expect(rows(window).last()).toBeFocused();
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('Expand all, Collapse all and Copy JSON path run from the palette', async () => {
  const { home, files } = setUp({ 'data.json': SAMPLE });
  const { app, window, close } = await launchApp(['--', files['data.json']!], { home });
  try {
    await expect(rows(window)).toHaveCount(4);
    await runCommand(window, 'Expand all nodes');
    await expect(rows(window)).toHaveCount(9);
    await rows(window).filter({ hasText: 'ok: true' }).click();
    await runCommand(window, 'Copy JSON path');
    await expect(window.getByTestId('status-message')).toHaveText('Copied $["odd key"].ok');
    await expect.poll(() => clipboardText(app)).toBe('$["odd key"].ok');
    await runCommand(window, 'Collapse all nodes');
    await expect(rows(window)).toHaveCount(4);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('Ctrl+U goes between the tree and the source, keeping the place', async () => {
  const text = JSON.stringify(Array.from({ length: 2000 }, (_, i) => i), null, 1);
  const { home, files } = setUp({ 'long.json': text });
  const { window, close } = await launchApp(['--', files['long.json']!], { home });
  try {
    await rows(window).first().click();
    await window.keyboard.press('End');
    await expect(rows(window).filter({ hasText: /^\s*1999$/ })).toBeVisible();
    await window.keyboard.press('Control+u');
    await expect(window.getByTestId('status-view')).toHaveText('Source');
    await expect(shownDocument(window).locator('.cm-line', { hasText: /^ 1999$/ })).toBeVisible();
    await window.keyboard.press('Control+u');
    await expect(window.getByTestId('status-view')).toHaveText('Tree');
    await expect(rows(window).filter({ hasText: /^\s*1999$/ })).toBeVisible();
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('invalid JSON opens as source with where it breaks; fixed and saved, its tree comes back', async () => {
  const { home, files } = setUp({ 'broken.json': '{\n  "a": 1,\n}\n' });
  const { app, window, close } = await launchApp(['--', files['broken.json']!], { home });
  try {
    await expect(banner(window)).toHaveText('Not valid JSON: line 3, column 1');
    await expect(shownDocument(window).locator('.cm-editor')).toBeVisible();
    await expect(window.getByTestId('status-view')).toHaveText('Source');
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Editing');
    await window.keyboard.press('Control+a');
    await window.keyboard.type('{"a": 1}');
    await window.keyboard.press('Control+s');
    await expect(window.getByTestId('status-message')).toHaveText('Saved');
    await pressInMain(app, window, 'E');
    // Edit mode refuses the tree until main has taken it back.
    await expect(window.getByTestId('status-mode')).not.toHaveText('Editing');
    await window.keyboard.press('Control+u');
    await expect(rows(window)).toHaveText([/\{1 key\}$/, /a: 1$/]);
    await expect(banner(window)).toHaveCount(0);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('JSON over 10 MB opens as source, with no Render anyway; Ctrl+F in the tree points to the source', async () => {
  const big = `[${'"padding padding padding padding",'.repeat(330_000)}0]`;
  const { home, files } = setUp({ 'big.json': big, 'small.json': '[1]' });
  const { window, close } = await launchApp(['--', files['big.json']!, files['small.json']!], { home });
  try {
    await window.getByRole('tab').first().click();
    await expect(banner(window)).toHaveText('Large file shown as source');
    await expect(banner(window).getByRole('button')).toHaveCount(0);
    await window.getByRole('tab').nth(1).click();
    await expect(rows(window)).toHaveCount(2);
    await rows(window).first().click();
    await window.keyboard.press('Control+f');
    await expect(window.getByTestId('status-message')).toHaveText('Find works in the source view (Ctrl+U)');
  } finally {
    await close();
    removeTempHome(home);
  }
});
