import AxeBuilder from '@axe-core/playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { launchApp, removeTempHome, tempHome } from '../helpers/launch';

const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const status = (window: Page) => window.locator('.find-bar [role="status"]');
const replaceField = (window: Page) => window.getByRole('textbox', { name: 'Replace with' });

/** A Markdown file holding `text`, open in edit mode with the caret in the editor. */
async function editing(text: string, name = 'notes.md') {
  const dir = tempHome();
  const file = path.join(dir, name);
  writeFileSync(file, text);
  const launched = await launchApp(['--', file]);
  const editor = shownDocument(launched.window).locator('.cm-content');
  await expect(shownDocument(launched.window).locator('h1, p').first()).toBeVisible();
  await pressInMain(launched.app, launched.window, 'E');
  await expect(editor).toBeFocused();
  return {
    ...launched,
    file,
    editor,
    // The edits are left unsaved: a normal close would ask to save them.
    close: async () => {
      launched.app.process().kill('SIGKILL');
      removeTempHome(dir);
    },
  };
}

async function openReplace(window: Page, query: string) {
  await window.keyboard.press('ControlOrMeta+H');
  await expect(window.getByRole('searchbox', { name: 'Find in document' })).toBeFocused();
  await window.keyboard.type(query);
}

test('Ctrl+H replaces one match then all of them, one undo takes Replace all back, and Ctrl+S writes it', async () => {
  const { window, file, editor, close } = await editing('# Cats\r\n\r\ncat, cat, cat.\r\n');
  try {
    await openReplace(window, 'cat');
    await expect(status(window)).toHaveText('1 of 4');
    await replaceField(window).fill('dog');
    await replaceField(window).press('Enter');
    await expect(status(window)).toHaveText('1 of 3');
    await expect(editor).toContainText('# dogs');
    await window.getByRole('button', { name: 'Replace all' }).click();
    await expect(status(window)).toHaveText('Replaced 3');
    await expect(editor).toContainText('dog, dog, dog.');
    await expect(window.locator('.tab-indicator[data-indicator="unsaved changes"]')).toBeAttached();

    await window.keyboard.press('Escape');
    await expect(editor).toBeFocused();
    await window.keyboard.press('ControlOrMeta+Z');
    await expect(editor).toContainText('cat, cat, cat.');
    await window.keyboard.press('ControlOrMeta+S');
    await expect(window.getByTestId('status-message')).toHaveText('Saved');
    expect(readFileSync(file, 'utf8')).toBe('# dogs\r\n\r\ncat, cat, cat.\r\n');
  } finally {
    await close();
  }
});

test("Ctrl+H outside edit mode opens no replace row and says it's for edit mode", async () => {
  const dir = tempHome();
  const file = path.join(dir, 'notes.md');
  writeFileSync(file, '# Notes\n');
  const { window, close } = await launchApp(['--', file]);
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+H');
    await expect(window.getByTestId('status-message')).toHaveText('Find and replace works in edit mode (Ctrl+E)');
    await expect(window.locator('.find-bar')).toHaveCount(0);
  } finally {
    await close();
    removeTempHome(dir);
  }
});

test('in split, replace changes the source even after a click in the preview, and the preview follows', async () => {
  const { window, close } = await editing('# Title\n\nalpha beta\n');
  try {
    const document = shownDocument(window);
    await window.keyboard.press('ControlOrMeta+Backslash');
    await expect(document.locator('p')).toHaveText('alpha beta');
    await document.locator('p').click();
    await openReplace(window, 'alpha');
    await expect(status(window)).toHaveText('1 of 1');
    await replaceField(window).fill('gamma');
    await window.getByRole('button', { name: 'Replace all' }).click();
    await expect(document.locator('.cm-content')).toContainText('gamma beta');
    await expect(document.locator('p')).toHaveText('gamma beta');
  } finally {
    await close();
  }
});

test('the find bar with its replace row has no accessibility violations, light or dark', async () => {
  const { app, window, close } = await editing('# Notes\n\nplan plan\n');
  try {
    await openReplace(window, 'plan');
    await expect(replaceField(window)).toBeVisible();
    for (const scheme of ['light', 'dark'] as const) {
      await app.evaluate(({ nativeTheme }, value) => (nativeTheme.themeSource = value), scheme);
      await expect(window.locator('html')).toHaveAttribute('data-scheme', scheme);
      // Legacy mode runs in the page itself: Electron can't open the helper page axe uses for frames.
      const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('.find-bar').analyze();
      expect(results.violations, scheme).toEqual([]);
    }
  } finally {
    await close();
  }
});

test('Ctrl+D and Ctrl+Shift+L add the next and every match as cursors; Esc goes back to one', async () => {
  const { window, editor, close } = await editing('# T\n\ncat cat cat\n\ncat\n\nbird bird\n');
  try {
    const selectFirstWord = async (text: string) => {
      await editor.locator('.cm-line', { hasText: text }).click();
      await window.keyboard.press('Home');
      await window.keyboard.press('Shift+ControlOrMeta+ArrowRight');
    };
    await selectFirstWord('cat cat cat');
    await window.keyboard.press('ControlOrMeta+D');
    await window.keyboard.press('ControlOrMeta+D');
    await window.keyboard.type('dog');
    await expect(editor).toContainText('dog dog dog');
    await expect(editor.locator('.cm-line', { hasText: /^cat$/ })).toHaveCount(1);

    await window.keyboard.press('Escape');
    await window.keyboard.type('!');
    await expect(editor).toContainText('!');
    expect(await editor.textContent()).toMatch(/^[^!]*![^!]*$/);

    await selectFirstWord('bird bird');
    await window.keyboard.press('ControlOrMeta+Shift+L');
    await window.keyboard.type('pig');
    await expect(editor.locator('.cm-line', { hasText: /^pig pig$/ })).toHaveCount(1);
  } finally {
    await close();
  }
});

test('Shift+Alt+↓, Ctrl+click and Alt+drag put a cursor on several lines, each taking the typing', async () => {
  const { window, editor, close } = await editing('# T\n\na\nb\nc\n');
  try {
    const line = (text: string) => editor.locator('.cm-line', { hasText: new RegExp(`^${text}$`) });
    await line('a').click();
    await window.keyboard.press('Home');
    await window.keyboard.press('Shift+Alt+ArrowDown');
    await window.keyboard.press('Shift+Alt+ArrowDown');
    await window.keyboard.type('-');
    for (const text of ['-a', '-b', '-c']) await expect(line(text)).toHaveCount(1);

    await window.keyboard.press('Escape');
    await line('-a').click({ position: { x: 1, y: 5 } });
    await line('-c').click({ position: { x: 1, y: 5 }, modifiers: ['ControlOrMeta'] });
    await window.keyboard.type('+');
    for (const text of ['\\+-a', '-b', '\\+-c']) await expect(line(text)).toHaveCount(1);

    // Alt+drag down the start of the lines: a zero-width column, one cursor a line.
    await window.keyboard.press('Escape');
    const top = (await line('\\+-a').boundingBox())!;
    const bottom = (await line('\\+-c').boundingBox())!;
    await window.keyboard.down('Alt');
    await window.mouse.move(top.x + 1, top.y + top.height / 2);
    await window.mouse.down();
    await window.mouse.move(bottom.x + 1, bottom.y + bottom.height / 2, { steps: 5 });
    await window.mouse.up();
    await window.keyboard.up('Alt');
    await window.keyboard.type('>');
    for (const text of ['>\\+-a', '>-b', '>\\+-c']) await expect(line(text)).toHaveCount(1);
  } finally {
    await close();
  }
});

test("draws edit mode's selection in the app's colours, not CodeMirror's default grey", async () => {
  const { window, editor, close } = await editing('# T\n\nselect me\n');
  try {
    await editor.locator('.cm-line', { hasText: 'select me' }).click();
    await window.keyboard.press('Home');
    await window.keyboard.press('Shift+End');
    const background = shownDocument(window).locator('.cm-selectionBackground').first();
    await expect(background).toBeAttached();
    const colour = await background.evaluate((element) => getComputedStyle(element).backgroundColor);
    // CodeMirror's defaults: #d9d9d9 unfocused, #d7d4f0 focused (light only).
    expect(colour).not.toMatch(/^rgb\((217, 217, 217|215, 212, 240)\)$/);
  } finally {
    await close();
  }
});
