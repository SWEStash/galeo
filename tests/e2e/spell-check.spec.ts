import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { appDirs, launchApp, removeTempHome, tempHome } from '../helpers/launch';
import { saveFile } from '../helpers/save';

// Spell check in edit mode (#52): off by default; on, misspelt words get suggestions and Add to
// dictionary above the document menu, with nothing downloaded. On Linux the suggestions come from the
// dictionary galeo ships: an Electron update that wants another dictionary file fails the first test.

const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const editor = (window: Page) => shownDocument(window).locator('.cm-content');
const answer = (app: ElectronApplication, choice: string) => app.evaluate((_electron, value) => void (process.env['GALEO_TEST_MENU_CHOICE'] = value), choice);
const menus = (app: ElectronApplication) => app.evaluate(() => ((globalThis as { __galeoMenus?: { label: string }[][] }).__galeoMenus ?? []).map((menu) => menu.map((item) => item.label)));

function home({ spell }: { spell?: true } = {}) {
  const dir = tempHome();
  const settings = path.join(appDirs(dir).config, 'settings.json');
  mkdirSync(path.dirname(settings), { recursive: true });
  saveFile(settings, spell ? '{"schemaVersion":1,"spellCheck":true}' : '{"schemaVersion":1}');
  const file = path.join(dir, 'draft.md');
  writeFileSync(file, 'I recieve mail\n');
  return { dir, file };
}

/** Chromium checks text when the editor is idle: right-click again only after a pause. */
const IDLE_CHECK = { timeout: 20_000, intervals: [2_000] };
// A test waits on up to three such checks, more than the default test timeout under load.
test.describe.configure({ timeout: 90_000 });

/** Right-clicks the middle of `word` in the editor, as a reader would. */
async function rightClickWord(window: Page, word: string) {
  const point = await editor(window).evaluate((element, wanted) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent!.indexOf(wanted);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at + 1);
      range.setEnd(node, at + 2);
      const box = range.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }
    return null;
  }, word);
  if (!point) throw new Error(`${word} isn't in the editor`);
  await window.mouse.click(point.x, point.y, { button: 'right' });
}

async function startEditing(app: ElectronApplication, window: Page, text = 'I recieve mail') {
  await expect(shownDocument(window).locator('p')).toHaveText(text);
  await pressInMain(app, window, 'E');
  await expect(editor(window)).toBeFocused();
}

/** Chromium starts checking an editor's text once a word is typed and ended with a space, as a reader does. */
async function typeAtEnd(window: Page, text: string) {
  await window.keyboard.press('ControlOrMeta+End');
  await window.keyboard.type(text);
}

test("with spell check on, a misspelt word's menu offers suggestions first, and the one chosen replaces it", async () => {
  const { dir, file } = home({ spell: true });
  const { app, window, close } = await launchApp(['--', file], { home: dir, env: { GALEO_TEST_MENU_CHOICE: 'none' } });
  try {
    await startEditing(app, window);
    await expect(editor(window)).toHaveAttribute('spellcheck', 'true');
    await typeAtEnd(window, ' today ');
    // Chromium checks the text once it's idle: retry until the word is marked.
    await expect
      .poll(async () => {
        await rightClickWord(window, 'recieve');
        return (await menus(app)).at(-1)?.[0];
      }, IDLE_CHECK)
      .toBe('receive');
    expect((await menus(app)).at(-1)).toEqual(expect.arrayContaining(['Add to dictionary', 'Back', 'Save', 'Copy path']));

    await answer(app, 'spelling-0');
    await rightClickWord(window, 'recieve');
    await expect(editor(window)).toHaveText(/^I receive mail/);
    await window.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => readFileSync(file, 'utf8')).toBe('I receive mail\n today ');
  } finally {
    await close();
    removeTempHome(dir);
  }
});

test('Add to dictionary stops marking the word', async () => {
  const { dir, file } = home({ spell: true });
  writeFileSync(file, 'I recieve galeoish mail\n');
  const { app, window, close } = await launchApp(['--', file], { home: dir, env: { GALEO_TEST_MENU_CHOICE: 'none' } });
  try {
    await startEditing(app, window, 'I recieve galeoish mail');
    await typeAtEnd(window, ' today ');
    await expect
      .poll(async () => {
        await rightClickWord(window, 'galeoish');
        return (await menus(app)).at(-1)?.includes('Add to dictionary');
      }, IDLE_CHECK)
      .toBe(true);
    await answer(app, 'learn');
    await expect
      .poll(async () => {
        await rightClickWord(window, 'galeoish');
        return (await menus(app)).at(-1)?.includes('Add to dictionary');
      }, IDLE_CHECK)
      .toBe(true);
    await answer(app, 'none');
    // As with a file's first check, Chromium checks the text again once a word is typed.
    await typeAtEnd(window, 'again ');
    await expect
      .poll(async () => {
        await rightClickWord(window, 'galeoish');
        return (await menus(app)).at(-1)?.[0];
      }, IDLE_CHECK)
      .toBe('Back');
    await window.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => readFileSync(file, 'utf8')).toContain('today');
  } finally {
    await close();
    removeTempHome(dir);
  }
});

test("spell check is off by default: the editor isn't checked and its menu is the usual one", async () => {
  const { dir, file } = home();
  const { app, window, close } = await launchApp(['--', file], { home: dir, env: { GALEO_TEST_MENU_CHOICE: 'none' } });
  try {
    await startEditing(app, window);
    await expect(editor(window)).toHaveAttribute('spellcheck', 'false');
    await rightClickWord(window, 'recieve');
    await expect.poll(async () => (await menus(app)).at(-1)?.[0]).toBe('Back');
  } finally {
    await close();
    removeTempHome(dir);
  }
});

test('with spell check on, only the editor is checked: not the page while reading, not the find field', async () => {
  const { dir, file } = home({ spell: true });
  const { window, close } = await launchApp(['--', file], { home: dir });
  try {
    await expect(shownDocument(window).locator('p')).toHaveText('I recieve mail');
    await window.keyboard.press('ControlOrMeta+F');
    const field = window.getByRole('searchbox', { name: 'Find in document' });
    await expect(field).toBeFocused();
    expect(await field.evaluate((element) => (element as HTMLInputElement).spellcheck)).toBe(false);
    await window.keyboard.press('Escape');
    // The source view while reading: shown, not checked.
    await window.keyboard.press('ControlOrMeta+U');
    await expect(editor(window)).toHaveAttribute('spellcheck', 'false');
  } finally {
    await close();
    removeTempHome(dir);
  }
});
