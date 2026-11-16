import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { appDirs, launchApp, removeTempHome, tempHome } from '../helpers/launch';
import { saveFile } from '../helpers/save';

// Vim keys in edit mode (#51): off by default, on in Settings; galeo's keys stay galeo's but Ctrl+R.

const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const editor = (window: Page) => shownDocument(window).locator('.cm-content');
const chip = (window: Page) => window.getByTestId('status-vim');

/** A temp home with a Markdown file; Vim keys on in the global settings, or left to the default. */
function home({ vim }: { vim?: true } = {}) {
  const dir = tempHome();
  const settings = path.join(appDirs(dir).config, 'settings.json');
  mkdirSync(path.dirname(settings), { recursive: true });
  saveFile(settings, vim ? '{"schemaVersion":1,"vimKeys":true}' : '{"schemaVersion":1}');
  const file = path.join(dir, 'notes.md');
  writeFileSync(file, 'one\ntwo\n');
  return { dir, file };
}

async function startEditing(app: ElectronApplication, window: Page, { vim = true } = {}) {
  await expect(shownDocument(window).locator('p')).toContainText('one');
  await pressInMain(app, window, 'E');
  await expect(editor(window)).toBeFocused();
  if (vim) await expect(chip(window)).toHaveText('NORMAL');
}

test('with Vim keys on, edit mode starts in normal mode; i, Esc and :w edit and save, and the status bar follows', async () => {
  const { dir, file } = home({ vim: true });
  const { app, window, close } = await launchApp(['--', file], { home: dir });
  try {
    await startEditing(app, window);
    await expect(chip(window)).toHaveText('NORMAL');

    await window.keyboard.type('ddi');
    await expect(chip(window)).toHaveText('INSERT');
    await window.keyboard.type('first ');
    await window.keyboard.press('Escape');
    await expect(chip(window)).toHaveText('NORMAL');
    await window.keyboard.type(':w');
    await window.keyboard.press('Enter');
    await expect.poll(() => readFileSync(file, 'utf8')).toBe('first two\n');

    // Reading again: no Vim mode to show.
    await pressInMain(app, window, 'E');
    await expect(chip(window)).toHaveCount(0);
  } finally {
    await close();
    removeTempHome(dir);
  }
});

test("Ctrl+R redoes in normal mode, and galeo's other keys still reach galeo", async () => {
  const { dir, file } = home({ vim: true });
  const { app, window, close } = await launchApp(['--', file], { home: dir });
  try {
    await startEditing(app, window);
    await window.keyboard.type('dd');
    await expect(editor(window)).toHaveText('two');
    await window.keyboard.type('u');
    await expect(editor(window)).toHaveText(/^one\s*two/);
    await window.keyboard.press('Control+r'); // portable: Vim's redo is the real Control key on every system (Cmd+R reloads on macOS)
    await expect(editor(window)).toHaveText('two');
    await expect(chip(window)).toHaveText('NORMAL');

    await window.keyboard.press('ControlOrMeta+p');
    await expect(window.getByTestId('quick-open')).toBeVisible();
    await window.keyboard.press('Escape');
    await window.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => readFileSync(file, 'utf8')).toBe('two\n');
  } finally {
    await close();
    removeTempHome(dir);
  }
});

test('"+y copies to the system clipboard and "+p pastes from it', async () => {
  const { dir, file } = home({ vim: true });
  const { app, window, close } = await launchApp(['--', file], { home: dir });
  try {
    await startEditing(app, window);
    await window.keyboard.type('"+yy');
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('one\n');

    await app.evaluate(({ clipboard }) => clipboard.writeText('pasted'));
    await window.keyboard.type('j"+P');
    await expect(editor(window)).toHaveText(/one\s*pastedtwo/);
    await window.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => readFileSync(file, 'utf8')).toBe('one\npastedtwo\n');
  } finally {
    await close();
    removeTempHome(dir);
  }
});

test('Vim keys are off by default, and the Settings switch turns them on in the open editor', async () => {
  const { dir, file } = home();
  const { app, window, close } = await launchApp(['--', file], { home: dir });
  try {
    await startEditing(app, window, { vim: false });
    await window.keyboard.type('dd');
    await expect(editor(window)).toHaveText(/^ddone/);
    await expect(chip(window)).toHaveCount(0);

    await window.keyboard.press('ControlOrMeta+Comma');
    const settings = window.getByTestId('settings-view');
    await expect(settings).toBeVisible();
    await settings.getByText('Vim keys', { exact: true }).click();
    await expect(settings.getByRole('switch', { name: 'Vim keys' })).toBeChecked();
    await window.keyboard.press('Control+Shift+Tab');
    await expect(chip(window)).toHaveText('NORMAL');
    // Back from Settings the focus is on the tab, not in the editor.
    await editor(window).click();
    await window.keyboard.type(':w');
    await window.keyboard.press('Enter');
    await expect.poll(() => readFileSync(file, 'utf8')).toBe('ddone\ntwo\n');
  } finally {
    await close();
    removeTempHome(dir);
  }
});
