import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, launchSecond, removeTempHome, tempHome } from '../helpers/launch';

// A profile's launcher on Windows (a Start menu shortcut) and macOS (the Dock menu) (#40). Linux's is
// profile-launcher.spec.ts. These run on the Platforms workflow's runners.
const basic = path.resolve(import.meta.dirname, '../fixtures/docs/basic.md');
// Any existing program: the test checks what the shortcut runs, not that it starts.
const TARGET = 'C:\\Windows\\System32\\notepad.exe';

async function rename(window: Page, name: string) {
  await window.getByTestId('profile-chip').click();
  await window.getByRole('menuitem', { name: /Edit profile/ }).click();
  await window.getByLabel('Name').fill(name);
  await window.getByRole('button', { name: 'Save' }).click();
  await expect(window.getByTestId('profile-chip')).toHaveAccessibleName(`Profile: ${name}`);
}

test.describe('Windows: a Start menu shortcut per profile', () => {
  test.skip(process.platform !== 'win32', 'Start menu shortcuts are Windows only');

  test('Settings adds it, a rename renames it, and Remove takes it out; other shortcuts stay', async () => {
    const home = tempHome();
    const menu = path.join(home, 'start-menu');
    mkdirSync(menu, { recursive: true });
    const { app, window, close } = await launchApp(['--', basic], {
      home,
      env: { GALEO_TEST_START_MENU: menu, GALEO_TEST_PROFILE_SHORTCUT_TARGET: TARGET },
    });
    const read = (file: string) => app.evaluate(({ shell }, p) => shell.readShortcutLink(p), file);
    const names = () => readdirSync(menu).sort();
    try {
      // Someone else's shortcut, which galeo must leave alone.
      await app.evaluate(({ shell }, p) => shell.writeShortcutLink(p, 'create', { target: 'C:\\Windows\\System32\\notepad.exe', args: '--profile default' }), path.join(menu, 'galeo · Mine.lnk'));
      await expect(window.getByRole('tab')).toHaveCount(1);
      await window.keyboard.press('ControlOrMeta+Comma');
      const result = window.getByTestId('profile-launcher-result');
      await window.getByRole('button', { name: 'Add to Start menu' }).click();
      await expect(result).toHaveText('Added “galeo · default” to the Start menu.');
      const link = await read(path.join(menu, 'galeo · default.lnk'));
      expect(link.target.toLowerCase()).toBe(TARGET.toLowerCase());
      expect(link.args).toBe('--profile default');

      await rename(window, 'Work / Notes');
      await expect.poll(names).toEqual(['galeo · Mine.lnk', 'galeo · Work - Notes.lnk']);

      await window.getByRole('button', { name: 'Remove from Start menu' }).click();
      await expect(result).toHaveText('Removed “galeo · Work / Notes” from the Start menu.');
      expect(names()).toEqual(['galeo · Mine.lnk']);
    } finally {
      await close();
      removeTempHome(home);
    }
  });

  test('deleting a profile removes its shortcut', async () => {
    const home = tempHome();
    const menu = path.join(home, 'start-menu');
    mkdirSync(menu, { recursive: true });
    const env = { GALEO_TEST_START_MENU: menu, GALEO_TEST_PROFILE_SHORTCUT_TARGET: TARGET };
    const { app, window, close } = await launchApp(['--', basic], { home, env });
    try {
      await expect(window.getByRole('tab')).toHaveCount(1);
      const opened = app.waitForEvent('window');
      // The running galeo takes it, with the test's environment.
      expect(launchSecond(home, ['--profile', 'Spare', '--', basic]).status).toBe(0);
      const spare = await opened;
      await expect(spare.getByRole('tab')).toHaveCount(1);
      await spare.keyboard.press('ControlOrMeta+Comma');
      await spare.getByRole('button', { name: 'Add to Start menu' }).click();
      await expect(spare.getByTestId('profile-launcher-result')).toHaveText('Added “galeo · Spare” to the Start menu.');
      expect(existsSync(path.join(menu, 'galeo · Spare.lnk'))).toBe(true);
      await spare.getByTestId('profile-chip').click();
      await spare.getByRole('menuitem', { name: /Delete profile/ }).click();
      const gone = spare.waitForEvent('close');
      await spare.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
      await gone;
      await expect.poll(() => existsSync(path.join(menu, 'galeo · Spare.lnk'))).toBe(false);
    } finally {
      await close();
      removeTempHome(home);
    }
  });
});

test.describe('macOS: every profile in the Dock menu', () => {
  test.skip(process.platform !== 'darwin', 'the Dock menu is macOS only');

  test('lists the profiles, follows a rename, and Settings says where they are', async () => {
    const home = tempHome();
    const { app, window, close } = await launchApp(['--', basic], { home });
    const dock = () => app.evaluate(() => (globalThis as { __galeoDockMenu?: unknown }).__galeoDockMenu);
    try {
      await expect(window.getByRole('tab')).toHaveCount(1);
      await expect.poll(dock).toEqual([
        { label: 'New window in', profile: null },
        { label: 'default', profile: 'default' },
      ]);
      await rename(window, 'Personal');
      await expect.poll(dock).toEqual([
        { label: 'New window in', profile: null },
        { label: 'Personal', profile: 'default' },
      ]);
      await window.keyboard.press('ControlOrMeta+Comma');
      await expect(window.getByTestId('profile-launcher-dock')).toContainText('Dock menu');
      await expect(window.getByRole('button', { name: /Add to/ })).toHaveCount(0);
    } finally {
      await close();
      removeTempHome(home);
    }
  });
});
