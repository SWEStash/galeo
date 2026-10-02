import AxeBuilder from '@axe-core/playwright';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { appDirs, launchApp, launchSecond, removeTempHome, tempHome } from '../helpers/launch';

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const basic = path.join(docs, 'basic.md');
const gfm = path.join(docs, 'gfm.md');

const paths = async (page: Page) => (await page.evaluate(() => window.galeo.tabs.snapshot())).tabs.map((tab) => tab.path);
const titles = (app: ElectronApplication) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((window) => window.getTitle()).sort());
const chip = (page: Page) => page.getByTestId('profile-chip');

async function menuAction(page: Page, name: string | RegExp) {
  await chip(page).click();
  await page.getByRole('menuitem', { name }).click();
}

test('the profile chip names the profile; its menu and dialogs pass axe', async () => {
  const { window, close } = await launchApp(['--', basic]);
  try {
    await expect(chip(window)).toHaveAccessibleName('Profile: default');
    const bar = await new AxeBuilder({ page: window }).setLegacyMode(true).include('.tab-bar').analyze();
    expect(bar.violations).toEqual([]);
    await chip(window).click();
    await expect(window.getByRole('menu')).toBeVisible();
    const menu = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[role="menu"]').analyze();
    expect(menu.violations).toEqual([]);
    await window.getByRole('menuitem', { name: /New profile/ }).click();
    await expect(window.getByRole('dialog')).toBeVisible();
    await expect(window.getByLabel('Name')).toBeFocused();
    const dialog = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[role="dialog"]').analyze();
    expect(dialog.violations).toEqual([]);
    await window.keyboard.press('Escape');
    await expect(window.getByRole('dialog')).toHaveCount(0);
    await expect(chip(window)).toBeFocused();
  } finally {
    await close();
  }
});

test('a new profile gets its own window, in its accent; a rename keeps its session', async () => {
  const home = tempHome();
  const first = await launchApp(['--', basic], { home });
  try {
    const { app, window } = first;
    await expect.poll(() => paths(window)).toEqual([basic]);
    const opened = app.waitForEvent('window');
    await menuAction(window, /New profile/);
    await window.getByLabel('Name').fill('Work');
    await window.getByRole('option', { name: 'Green' }).click();
    await window.getByRole('button', { name: 'Create' }).click();
    const work = await opened;
    await expect(chip(work)).toHaveAccessibleName('Profile: Work');
    const file = JSON.parse(readFileSync(path.join(appDirs(home).config, 'profiles', 'work', 'profile.json'), 'utf8'));
    expect(file).toMatchObject({ name: 'Work', accent: '#2f9e44' });
    expect(await work.evaluate(() => document.documentElement.style.getPropertyValue('--galeo-color-accent'))).toBe('#2f9e44');

    expect(launchSecond(home, ['--profile', 'Work', '--', gfm]).status).toBe(0);
    await expect.poll(() => paths(work)).toEqual([gfm]);
    await menuAction(work, /Edit profile/);
    await work.getByLabel('Name').fill('Work EU');
    await work.getByRole('button', { name: 'Save' }).click();
    await expect(chip(work)).toHaveAccessibleName('Profile: Work EU');
    await expect.poll(() => titles(app)).toEqual(['basic.md — default — galeo', 'gfm.md — Work EU — galeo']);
    // Another window's menu follows the rename.
    await chip(window).click();
    await expect(window.getByRole('menuitem', { name: /Work EU/ })).toBeVisible();
    await window.keyboard.press('Escape');
  } finally {
    await first.close();
  }
  // The id stayed `work`: the renamed profile still has its session.
  const again = await launchApp(['--profile', 'Work EU'], { home });
  try {
    await expect.poll(() => paths(again.window)).toEqual([gfm]);
  } finally {
    await again.close();
    removeTempHome(home);
  }
});

test('a name another profile has is refused in the dialog, which stays open', async () => {
  const { window, close } = await launchApp();
  try {
    await menuAction(window, /New profile/);
    await window.getByLabel('Name').fill('DEFAULT');
    await window.getByRole('button', { name: 'Create' }).click();
    await expect(window.getByRole('dialog')).toContainText('Another profile has this name.');
    await expect(window.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true');
  } finally {
    await close();
  }
});

test('switching to a stopped profile starts it with its session', async () => {
  const home = tempHome();
  const { app, window, close } = await launchApp(['--', basic], { home });
  try {
    await expect.poll(() => paths(window)).toEqual([basic]);
    const opened = app.waitForEvent('window');
    expect(launchSecond(home, ['--profile', 'Beta', '--', gfm]).status).toBe(0);
    const beta = await opened;
    await expect.poll(() => paths(beta)).toEqual([gfm]);
    // Beta's only window closes: Beta stops, keeping its session.
    const gone = beta.waitForEvent('close');
    await pressInMain(app, beta, 'W', true);
    await gone;
    await chip(window).click();
    await expect(window.getByRole('menuitem', { name: /Beta/ })).toContainText('Not open');
    const back = app.waitForEvent('window');
    await window.getByRole('menuitem', { name: /Beta/ }).click();
    const restored = await back;
    await expect.poll(() => paths(restored)).toEqual([gfm]);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('deleting a profile asks first, closes its windows and removes only its own folders', async () => {
  const home = tempHome();
  const { app, window, close } = await launchApp(['--', basic], { home });
  try {
    await expect.poll(() => paths(window)).toEqual([basic]);
    const opened = app.waitForEvent('window');
    expect(launchSecond(home, ['--profile', 'Old', '--', gfm]).status).toBe(0);
    const old = await opened;
    await expect.poll(() => paths(old)).toEqual([gfm]);
    await menuAction(old, /Delete profile/);
    const confirm = old.getByRole('alertdialog');
    await expect(confirm).toContainText("Delete profile 'Old'?");
    await expect(confirm).toContainText("the profile's session and settings; your files are not touched");
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
    const gone = old.waitForEvent('close');
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await gone;
    const { config, state } = appDirs(home);
    await expect.poll(() => existsSync(path.join(config, 'profiles', 'old'))).toBe(false);
    // Its state folder goes right after its config folder.
    await expect.poll(() => existsSync(path.join(state, 'profiles', 'old'))).toBe(false);
    expect(existsSync(gfm)).toBe(true);
    expect(await paths(window)).toEqual([basic]);
    // default is never offered for deletion.
    await chip(window).click();
    await expect(window.getByRole('menuitem', { name: /Delete profile/ })).toBeDisabled();
  } finally {
    await close();
    removeTempHome(home);
  }
});
