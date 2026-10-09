import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { appDirs, launchApp, launchSecond, removeTempHome, tempHome } from '../helpers/launch';

const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const indicator = (window: Page, words: string) => window.locator(`.tab-indicator[data-indicator="${words}"]`);

test('Ctrl+E edits the shown file, Ctrl+S saves it with its own line endings, and Ctrl+E reads again', async () => {
  const dir = tempHome();
  const file = path.join(dir, 'notes.md');
  writeFileSync(file, '# Notes\r\n\r\nFirst line.\r\n');
  const { app, window, close } = await launchApp(['--', file]);
  try {
    await expect(shownDocument(window).locator('h1')).toHaveText('Notes');
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Editing');
    await expect(indicator(window, 'edit mode')).toBeAttached();
    const editor = shownDocument(window).locator('.cm-content');
    await expect(editor).toBeFocused();

    await window.keyboard.press('Control+End');
    await window.keyboard.type('Second line.');
    await expect(indicator(window, 'unsaved changes')).toBeAttached();
    await window.keyboard.press('Control+s');
    await expect(window.getByTestId('status-message')).toHaveText('Saved');
    await expect(indicator(window, 'unsaved changes')).toHaveCount(0);
    expect(readFileSync(file, 'utf8')).toBe('# Notes\r\n\r\nFirst line.\r\nSecond line.');

    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Read-only');
    await expect(indicator(window, 'edit mode')).toHaveCount(0);
  } finally {
    await close();
    removeTempHome(dir);
  }
});

/** A file in edit mode with one unsaved line. Closing it would ask, so a failed test's cleanup kills it. */
async function dirtyEdit(text = '# Draft\n', { open = (file: string) => file }: { open?: (file: string) => string } = {}) {
  const dir = tempHome();
  const file = path.join(dir, 'draft.md');
  writeFileSync(file, text);
  const launched = await launchApp(['--', open(file)]);
  const { app, window } = launched;
  await expect(shownDocument(window).locator('h1')).toHaveText('Draft');
  await pressInMain(app, window, 'E');
  await expect(shownDocument(window).locator('.cm-content')).toBeFocused();
  await window.keyboard.press('Control+End');
  await window.keyboard.type('More.');
  await expect(indicator(window, 'unsaved changes')).toBeAttached();
  return { ...launched, dir, file };
}

const unsavedDialog = (window: Page) => window.getByRole('alertdialog', { name: 'Save changes to draft.md?' });

test('closing the window with unsaved changes asks: Cancel keeps it, Save writes the file and closes it', async () => {
  const { app, window, close, dir, file } = await dirtyEdit();
  let closed = false;
  try {
    await pressInMain(app, window, 'W', true);
    await expect(unsavedDialog(window)).toBeVisible();
    await expect(unsavedDialog(window).getByRole('button', { name: 'Save', exact: true })).toBeFocused();
    await window.keyboard.press('Escape');
    await expect(unsavedDialog(window)).toHaveCount(0);
    expect(app.windows()).toHaveLength(1);

    const exited = app.waitForEvent('close');
    await pressInMain(app, window, 'W', true);
    await unsavedDialog(window).getByRole('button', { name: 'Save', exact: true }).click();
    await exited;
    closed = true;
    expect(readFileSync(file, 'utf8')).toBe('# Draft\nMore.');
  } finally {
    if (!closed) {
      app.process().kill('SIGKILL');
      await close().catch(() => {});
    }
    removeTempHome(dir);
  }
});

test("quitting with unsaved changes asks: Cancel keeps the app, Don't save quits and leaves the file alone", async () => {
  const { app, window, close, dir, file } = await dirtyEdit();
  let quit = false;
  try {
    await pressInMain(app, window, 'Q', process.platform !== 'darwin');
    await unsavedDialog(window).getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(unsavedDialog(window)).toHaveCount(0);
    await expect(indicator(window, 'unsaved changes')).toBeAttached();

    const exited = app.waitForEvent('close');
    await pressInMain(app, window, 'Q', process.platform !== 'darwin');
    await unsavedDialog(window).getByRole('button', { name: "Don't save" }).click();
    await exited;
    quit = true;
    expect(readFileSync(file, 'utf8')).toBe('# Draft\n');
  } finally {
    if (!quit) {
      app.process().kill('SIGKILL');
      await close().catch(() => {});
    }
    removeTempHome(dir);
  }
});

test("deleting a profile with unsaved changes asks: Cancel keeps it, Don't save deletes it", async () => {
  const home = tempHome();
  const file = path.join(home, 'draft.md');
  writeFileSync(file, '# Draft\n');
  const basic = path.resolve(import.meta.dirname, '../fixtures/docs/basic.md');
  const { app, close } = await launchApp(['--', basic], { home });
  try {
    const opened = app.waitForEvent('window');
    expect(launchSecond(home, ['--profile', 'Old', '--', file]).status).toBe(0);
    const old = await opened;
    await expect(shownDocument(old).locator('h1')).toHaveText('Draft');
    await pressInMain(app, old, 'E');
    await expect(shownDocument(old).locator('.cm-content')).toBeFocused();
    await old.keyboard.type('More. ');
    await expect(indicator(old, 'unsaved changes')).toBeAttached();
    const deleteProfile = async () => {
      await old.getByTestId('profile-chip').click();
      await old.getByRole('menuitem', { name: /Delete profile/ }).click();
      await old.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    };

    await deleteProfile();
    await unsavedDialog(old).getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(indicator(old, 'unsaved changes')).toBeAttached();
    expect(existsSync(path.join(appDirs(home).config, 'profiles', 'old'))).toBe(true);

    const gone = old.waitForEvent('close');
    await deleteProfile();
    await unsavedDialog(old).getByRole('button', { name: "Don't save" }).click();
    await gone;
    await expect.poll(() => existsSync(path.join(appDirs(home).config, 'profiles', 'old'))).toBe(false);
    expect(readFileSync(file, 'utf8')).toBe('# Draft\n');
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('unsaved text never reaches a state file, while main holds it for a crash', async () => {
  const { app, window, home, dir } = await dirtyEdit();
  try {
    await window.keyboard.type(' Words not saved yet.');
    // The page hands its unsaved text to main once typing pauses for a second.
    await window.waitForTimeout(1500);
    // A new window makes the profile save its session now, with the edited tab in it.
    await pressInMain(app, window, 'N');
    await expect.poll(() => app.windows().length).toBe(2);
    const session = path.join(appDirs(home).state, 'profiles', 'default', 'session.json');
    // Saved 2 s after the last change.
    const windowsSaved = () => (existsSync(session) ? (JSON.parse(readFileSync(session, 'utf8')) as { windows: unknown[] }).windows.length : 0);
    await expect.poll(windowsSaved, { timeout: 15_000 }).toBe(2);
    const state = path.join(appDirs(home).state, 'profiles', 'default');
    for (const name of readdirSync(state)) expect(readFileSync(path.join(state, name), 'utf8')).not.toContain('not saved yet');
  } finally {
    app.process().kill('SIGKILL');
    removeTempHome(home);
    removeTempHome(dir);
  }
});

const message = (window: Page) => window.getByTestId('status-message');

test('a change on disk while edits are unsaved is never overwritten: the save is refused and both texts stay', async () => {
  const { app, window, home, dir, file } = await dirtyEdit();
  try {
    writeFileSync(file, '# Theirs\n');
    // The watcher reports it; the editor keeps the unsaved text.
    await window.waitForTimeout(500);
    await expect(shownDocument(window).locator('.cm-content')).toContainText('More.');
    await window.keyboard.press('Control+s');
    await expect(message(window)).toHaveText('Not saved: the file changed on disk');
    expect(readFileSync(file, 'utf8')).toBe('# Theirs\n');
    await expect(indicator(window, 'unsaved changes')).toBeAttached();
  } finally {
    app.process().kill('SIGKILL');
    removeTempHome(home);
    removeTempHome(dir);
  }
});

test('saving a symlinked file writes its target and keeps the link', async () => {
  let link = '';
  const { app, window, home, dir, file } = await dirtyEdit('# Draft\n', {
    open: (target) => {
      const links = path.join(path.dirname(target), 'links');
      mkdirSync(links);
      link = path.join(links, 'draft.md');
      symlinkSync(target, link);
      return link;
    },
  });
  try {
    await window.keyboard.press('Control+s');
    await expect(message(window)).toHaveText('Saved');
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('# Draft\nMore.');
  } finally {
    app.process().kill('SIGKILL');
    removeTempHome(home);
    removeTempHome(dir);
  }
});

test.describe(() => {
  test.skip(process.platform === 'win32' || process.getuid?.() === 0, 'POSIX permissions, as a user other than root');
  test("a read-only file isn't replaced: the save says so and the edits stay", async () => {
    const { app, window, home, dir, file } = await dirtyEdit();
    try {
      chmodSync(file, 0o444);
      await window.keyboard.press('Control+s');
      await expect(message(window)).toHaveText('Not saved: no permission to write this file');
      expect(readFileSync(file, 'utf8')).toBe('# Draft\n');
      await expect(indicator(window, 'unsaved changes')).toBeAttached();
    } finally {
      app.process().kill('SIGKILL');
      chmodSync(file, 0o644);
      removeTempHome(home);
      removeTempHome(dir);
    }
  });
});
