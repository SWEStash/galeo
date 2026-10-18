import AxeBuilder from '@axe-core/playwright';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { appDirs, launchApp, launchSecond, removeTempHome, tempHome } from '../helpers/launch';

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const basic = path.join(docs, 'basic.md');

const titles = (app: ElectronApplication) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((window) => window.getTitle()).sort());
const settingsView = (page: Page) => page.getByTestId('settings-view');
const articleFontSize = (page: Page) =>
  page.locator('[data-testid="document"] article').first().evaluate((element) => getComputedStyle(element).fontSize);
const openedPaths = (app: ElectronApplication) => app.evaluate(() => (globalThis as { __galeoOpenedPaths?: string[] }).__galeoOpenedPaths ?? []);

function writeConfig(home: string, file: string, content: string) {
  const target = path.join(appDirs(home).config, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

test('Ctrl+, opens the Settings tab once, named in the title, and it passes axe', async () => {
  const { app, window, close } = await launchApp(['--', basic]);
  try {
    await expect(window.getByRole('tab')).toHaveCount(1);
    await window.keyboard.press('ControlOrMeta+Comma');
    await expect(settingsView(window)).toBeVisible();
    await expect(window.getByRole('tab', { selected: true })).toContainText('Settings');
    await expect.poll(() => titles(app)).toEqual(['Settings — default — galeo']);
    await window.getByRole('tab').first().click();
    await window.keyboard.press('ControlOrMeta+Comma');
    await expect(window.getByRole('tab')).toHaveCount(2);
    const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[data-testid="settings-view"]').analyze();
    expect(results.violations).toEqual([]);
  } finally {
    await close();
  }
});

test("a setting changed for one profile leaves the other alone; Reset to global undoes it", async () => {
  const home = tempHome();
  const { app, window, close } = await launchApp(['--', basic], { home });
  try {
    const opened = app.waitForEvent('window');
    expect(launchSecond(home, ['--profile', 'Work', '--', basic]).status).toBe(0);
    const work = await opened;
    await expect.poll(() => articleFontSize(work)).toBe('17px');
    await work.keyboard.press('ControlOrMeta+Comma');
    const size = settingsView(work).getByLabel('Font size');
    await size.fill('22');
    await size.press('Enter');
    const profileFile = path.join(appDirs(home).config, 'profiles', 'work', 'profile.json');
    await expect.poll(() => existsSync(profileFile) && JSON.parse(readFileSync(profileFile, 'utf8')).settings?.fontSize).toBe(22);
    await work.getByRole('tab').first().click();
    await expect.poll(() => articleFontSize(work)).toBe('22px');
    expect(await articleFontSize(window)).toBe('17px');
    await work.getByRole('tab', { name: /Settings/ }).click();
    await settingsView(work).locator('[data-setting="fontSize"]').getByRole('button', { name: 'Reset to global' }).click();
    await expect.poll(() => JSON.parse(readFileSync(profileFile, 'utf8')).settings).toEqual({});
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('a change over an invalid hand edit is refused, naming the file, which stays untouched', async () => {
  const home = tempHome();
  const broken = '{"schemaVersion":1, "settings": {';
  const file = writeConfig(home, 'profiles/default/profile.json', broken);
  const { window, close } = await launchApp([], { home });
  try {
    await expect(window.getByTestId('app-root')).toHaveAttribute('data-worker', 'ready');
    await window.keyboard.press('ControlOrMeta+Comma');
    await settingsView(window).getByText('Dark', { exact: true }).click();
    await expect(settingsView(window).getByRole('alert')).toContainText(file);
    expect(readFileSync(file, 'utf8')).toBe(broken);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test("Open CSS creates the profile's custom.css owner-only and hands it to the editor", async () => {
  const home = tempHome();
  const { app, window, close } = await launchApp([], { home, env: { GALEO_TEST_EXTERNAL: 'record' } });
  try {
    await expect(window.getByTestId('app-root')).toHaveAttribute('data-worker', 'ready');
    await window.keyboard.press('ControlOrMeta+Comma');
    await settingsView(window).getByRole('button', { name: 'Open CSS for this profile' }).click();
    const css = path.join(appDirs(home).config, 'profiles', 'default', 'custom.css');
    await expect.poll(() => openedPaths(app)).toEqual([css]);
    expect(readFileSync(css, 'utf8')).toContain('galeo');
    if (process.platform !== 'win32') expect(statSync(css).mode & 0o777).toBe(0o600);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test("a settings notice's Open file hands the broken file to the editor", async () => {
  const home = tempHome();
  const file = writeConfig(home, 'settings.json', '{"schemaVersion":1,"fontSize":"big"}');
  const { app, window, close } = await launchApp([], { home, env: { GALEO_TEST_EXTERNAL: 'record' } });
  try {
    const notice = window.getByTestId('settings-notice');
    await expect(notice).toContainText(file);
    await notice.getByRole('button', { name: 'Open file' }).click();
    await expect.poll(() => openedPaths(app)).toEqual([file]);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('the Settings tab is not part of the saved session', async () => {
  const home = tempHome();
  const first = await launchApp(['--', basic], { home });
  try {
    await expect(first.window.getByRole('tab')).toHaveCount(1);
    await first.window.keyboard.press('ControlOrMeta+Comma');
    await expect(first.window.getByRole('tab')).toHaveCount(2);
  } finally {
    await first.close();
  }
  const again = await launchApp([], { home });
  try {
    await expect(again.window.getByRole('tab')).toHaveCount(1);
    await expect(again.window.getByRole('tab')).toContainText('basic.md');
  } finally {
    await again.close();
    removeTempHome(home);
  }
});

for (const theme of ['light', 'dark'] as const) {
  test(`the code font picker lists the bundled font, then installed monospace ones, and passes axe open (${theme})`, async () => {
    const home = tempHome();
    writeConfig(home, 'settings.json', `{"schemaVersion":1,"themeMode":"${theme}"}`);
    const { window, close } = await launchApp(['--', basic], { home });
    try {
      await expect(window.locator('[data-testid="document"] article h1')).toBeVisible();
      await window.keyboard.press('ControlOrMeta+Comma');
      await settingsView(window).getByRole('button', { name: 'Show code fonts' }).click();
      const list = window.getByRole('listbox');
      // Open, the list hides the rest of the page from assistive tech (RAC): check the list itself; the
      // closed view is checked by the Ctrl+, test.
      await expect(list.getByRole('option').first()).toHaveText('JetBrains Mono');
      const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[role="listbox"]').analyze();
      expect(results.violations).toEqual([]);
      await window.keyboard.press('Escape');
    } finally {
      await close();
      removeTempHome(home);
    }
  });
}

test("a font chosen in the prose picker is the article's font, and a name typed in is kept", async () => {
  const home = tempHome();
  const { window, close } = await launchApp(['--', basic], { home });
  try {
    await expect(window.locator('[data-testid="document"] article h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+Comma');
    await settingsView(window).getByRole('button', { name: 'Show prose fonts' }).click();
    await window.getByRole('option', { name: 'Source Serif 4' }).click();
    const proseFont = () => window.locator('[data-testid="document"] article').first().evaluate((element) => getComputedStyle(element).fontFamily);
    await expect.poll(proseFont).toContain('Source Serif 4');
    const field = settingsView(window).getByRole('combobox', { name: 'Prose font' });
    await field.fill('Not An Installed Font');
    await field.press('Enter');
    await expect.poll(proseFont).toContain('Not An Installed Font');
    await expect(field).toHaveValue('Not An Installed Font');
  } finally {
    await close();
    removeTempHome(home);
  }
});
