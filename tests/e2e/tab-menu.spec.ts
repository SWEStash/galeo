import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { appDirs, launchApp, removeTempHome, tempHome } from '../helpers/launch';
import { pressInMain } from '../helpers/keys';
import { saveFile } from '../helpers/save';

// A tab's right-click menu (UX F4, mouse paths review): built by main; the page runs what it hands back.
const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const files = ['basic.md', 'gfm.md', 'math.md'].map((name) => path.join(docs, name));

const answer = (app: ElectronApplication, choice: string) => app.evaluate((_electron, value) => void (process.env['GALEO_TEST_MENU_CHOICE'] = value), choice);
const menus = (app: ElectronApplication) => app.evaluate(() => (globalThis as { __galeoMenus?: { label: string; enabled?: boolean }[][] }).__galeoMenus ?? []);
/** The window's tabs in order, by file name, as main holds them. */
const names = (page: Page) => page.evaluate(async () => (await window.galeo.tabs.snapshot()).tabs.map((tab) => tab.path.split(/[\\/]/).at(-1)));

test('a right-click on a tab offers its commands; each runs on that tab, as its shortcut does', async () => {
  const { app, window, close } = await launchApp(['--', ...files], { env: { GALEO_TEST_MENU_CHOICE: 'none' } });
  try {
    await expect(window.getByRole('tab')).toHaveCount(3);
    const gfm = window.getByRole('tab', { name: /gfm\.md/ });

    await gfm.click({ button: 'right' });
    await expect.poll(async () => (await menus(app)).length).toBe(1);
    expect((await menus(app))[0]!.map((item) => `${item.label}${item.enabled === false ? ' (off)' : ''}`)).toEqual([
      'Close tab', 'Close others', 'Reopen closed tab (off)', 'Move to new window', 'Move to window…', 'Copy path', 'Reveal in Files', 'Pin tab',
    ]);

    await answer(app, 'pin');
    await gfm.click({ button: 'right' });
    await expect.poll(() => names(window)).toEqual(['gfm.md', 'basic.md', 'math.md']);
    await expect(window.getByRole('tab').first()).toHaveAccessibleName(/pinned/);

    await answer(app, 'copy-path');
    await app.evaluate(({ clipboard }) => clipboard.writeText('before'));
    await window.getByRole('tab', { name: /math\.md/ }).click({ button: 'right' });
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe(files[2]);

    // Close takes the right-clicked tab, not the shown one; Reopen brings it back, however long the reader took.
    await expect(window.getByRole('tab', { selected: true })).toHaveAccessibleName(/basic\.md/);
    await answer(app, 'close');
    await window.getByRole('tab', { name: /math\.md/ }).click({ button: 'right' });
    await expect.poll(() => names(window)).toEqual(['gfm.md', 'basic.md']);
    await window.waitForTimeout(1200);
    await answer(app, 'reopen');
    await window.getByRole('tab', { name: /basic\.md/ }).click({ button: 'right' });
    await expect.poll(() => names(window)).toEqual(['gfm.md', 'basic.md', 'math.md']);

    // Move to new window takes the right-clicked tab to a window of its own.
    await answer(app, 'move-new');
    const opened = app.waitForEvent('window');
    await window.getByRole('tab', { name: /math\.md/ }).click({ button: 'right' });
    const moved = await opened;
    await expect(moved.getByRole('tab')).toHaveCount(1);
    await expect(moved.getByRole('tab')).toHaveAccessibleName(/math\.md/);
    await expect.poll(() => names(window)).toEqual(['gfm.md', 'basic.md']);
  } finally {
    await close();
  }
});

test('the context-menu key on a focused tab opens its menu too', async () => {
  test.skip(process.platform === 'darwin', 'macOS has no context-menu key');
  const { app, window, close } = await launchApp(['--', ...files.slice(0, 2)], { env: { GALEO_TEST_MENU_CHOICE: 'pin' } });
  try {
    await window.getByRole('tab', { name: /basic\.md/ }).click();
    await window.keyboard.press('ArrowRight');
    await expect(window.getByRole('tab', { name: /gfm\.md/ })).toBeFocused();
    await window.keyboard.press('Shift+F10');
    await expect.poll(() => names(window)).toEqual(['gfm.md', 'basic.md']);
    expect(await menus(app)).toHaveLength(1);
  } finally {
    await close();
  }
});

test('with the tabs on the left, a row and a collapsed marker offer the same menu', async () => {
  const home = tempHome();
  const write = (file: string, content: string) => {
    const target = path.join(appDirs(home).config, file);
    mkdirSync(path.dirname(target), { recursive: true });
    saveFile(target, content);
  };
  write('profiles/default/profile.json', '{"schemaVersion":1,"name":"default","settings":{"tabsPosition":"left"}}');
  const { app, window, close } = await launchApp(['--', ...files], { home, env: { GALEO_TEST_MENU_CHOICE: 'pin' } });
  try {
    await expect(window.getByRole('tab')).toHaveCount(3);
    await window.getByRole('tab', { name: /math\.md/ }).click({ button: 'right' });
    await expect.poll(() => names(window)).toEqual(['math.md', 'basic.md', 'gfm.md']);
    await window.getByTestId('panel-toggle').click();
    await expect(window.getByTestId('side-panel')).toHaveAttribute('data-collapsed', 'true');
    await window.getByRole('tab', { name: /gfm\.md/ }).click({ button: 'right' });
    await expect.poll(() => names(window)).toEqual(['math.md', 'gfm.md', 'basic.md']);
    expect((await menus(app)).map((menu) => menu.at(-1)!.label)).toEqual(['Pin tab', 'Pin tab']);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test("a right-click on an overview card offers the same menu, for that card's tab", async () => {
  const { app, window, close } = await launchApp(['--', ...files], { env: { GALEO_TEST_MENU_CHOICE: 'pin' } });
  try {
    await expect(window.getByRole('tab')).toHaveCount(3);
    await window.keyboard.press('ControlOrMeta+Shift+E');
    const card = window.getByTestId('overview-card').filter({ hasText: 'math.md' });
    await card.click({ button: 'right' });
    await expect.poll(() => names(window)).toEqual(['math.md', 'basic.md', 'gfm.md']);
    expect((await menus(app)).at(-1)!.at(-1)!.label).toBe('Pin tab');
    await expect(window.getByTestId('tab-overview')).toBeVisible();
    await expect(window.getByTestId('overview-card').first()).toContainText('math.md');
  } finally {
    await close();
  }
});

test('Close others closes every other unpinned tab, from a tab or an overview card; pinned tabs stay', async () => {
  const four = [...files, path.join(docs, 'frontmatter.md')];
  const { app, window, close } = await launchApp(['--', ...four], { env: { GALEO_TEST_MENU_CHOICE: 'pin' } });
  try {
    await expect(window.getByRole('tab')).toHaveCount(4);
    await window.getByRole('tab', { name: /basic\.md/ }).click({ button: 'right' });
    await expect(window.getByRole('tab').first()).toHaveAccessibleName(/pinned/);

    await answer(app, 'close-others');
    await window.getByRole('tab', { name: /math\.md/ }).click({ button: 'right' });
    await expect.poll(() => names(window)).toEqual(['basic.md', 'math.md']);
    await expect(window.getByRole('tab', { selected: true })).toHaveAccessibleName(/math\.md/);
    // Only a pinned tab is left besides it: nothing to close.
    await answer(app, 'none');
    await window.getByRole('tab', { name: /math\.md/ }).click({ button: 'right' });
    await expect.poll(async () => (await menus(app)).at(-1)?.find((item) => item.label === 'Close others')?.enabled).toBe(false);

    await window.keyboard.press('ControlOrMeta+Shift+T');
    await window.keyboard.press('ControlOrMeta+Shift+T');
    await expect.poll(() => names(window)).toHaveLength(4);
    await answer(app, 'close-others');
    await window.keyboard.press('ControlOrMeta+Shift+E');
    await window.getByTestId('overview-card').filter({ hasText: 'gfm.md' }).click({ button: 'right' });
    await expect.poll(() => names(window)).toEqual(['basic.md', 'gfm.md']);
  } finally {
    await close();
  }
});

test('Close others asks first about a tab with unsaved changes; Cancel keeps it', async () => {
  const dir = tempHome();
  const [notes, other] = ['notes.md', 'other.md'].map((name) => path.join(dir, name));
  for (const file of [notes!, other!]) writeFileSync(file, '# Notes\n');
  const { app, window, close } = await launchApp(['--', notes!, other!], { env: { GALEO_TEST_MENU_CHOICE: 'close-others' } });
  try {
    await expect(window.getByRole('tab')).toHaveCount(2);
    await window.keyboard.press('ControlOrMeta+1');
    await pressInMain(app, window, 'E');
    await expect(window.locator('[data-testid="tab-panel"][data-active="true"] .cm-content')).toBeFocused();
    await window.keyboard.type('Changed. ');
    await expect(window.locator('.tab-indicator[data-indicator="unsaved changes"]')).toBeAttached();

    const dialog = window.getByTestId('unsaved-dialog');
    await window.getByRole('tab', { name: /other\.md/ }).click({ button: 'right' });
    await expect(dialog).toBeVisible();
    // The tab it asks about is the one shown.
    await expect(window.getByRole('tab', { selected: true })).toHaveAccessibleName(/notes\.md/);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => names(window)).toEqual(['notes.md', 'other.md']);
    await expect(window.getByRole('tab', { selected: true })).toHaveAccessibleName(/other\.md/);

    await window.getByRole('tab', { name: /other\.md/ }).click({ button: 'right' });
    await dialog.getByRole('button', { name: "Don't save" }).click();
    await expect.poll(() => names(window)).toEqual(['other.md']);
  } finally {
    await close();
    removeTempHome(dir);
  }
});
