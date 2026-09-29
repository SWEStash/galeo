import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { appDirs, launchApp, launchSecond, removeTempHome, tempHome } from '../helpers/launch';
import { saveFile } from '../helpers/save';

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const basic = path.join(docs, 'basic.md');

const scheme = (page: Page) => page.locator('html').getAttribute('data-scheme');
const articleStyle = (page: Page, property: 'color' | 'fontSize') =>
  page
    .locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"] article')
    .evaluate((element, name) => getComputedStyle(element)[name], property);

function writeConfig(home: string, file: string, content: string) {
  const target = path.join(appDirs(home).config, file);
  mkdirSync(path.dirname(target), { recursive: true });
  saveFile(target, content);
  return target;
}

test('two profiles side by side keep their own theme mode and font size', async () => {
  const home = tempHome();
  writeConfig(home, 'settings.json', '{"schemaVersion":1,"themeMode":"light"}');
  writeConfig(home, 'profiles/night/profile.json', '{"schemaVersion":1,"name":"Night","settings":{"themeMode":"dark","fontSize":22}}');
  const { app, window, close } = await launchApp(['--', basic], { home });
  try {
    await expect.poll(() => scheme(window)).toBe('light');
    const opened = app.waitForEvent('window');
    expect(launchSecond(home, ['--profile', 'night', '--', basic]).status).toBe(0);
    const night = await opened;
    await expect.poll(() => scheme(night)).toBe('dark');
    await expect.poll(() => articleStyle(night, 'fontSize')).toBe('22px');
    expect(await scheme(window)).toBe('light');
    expect(await articleStyle(window, 'fontSize')).toBe('17px');
  } finally {
    await close();
    removeTempHome(home);
  }
});

test("custom CSS restyles open documents live, the profile's over the global one", async () => {
  const home = tempHome();
  const global = writeConfig(home, 'custom.css', 'article { color: rgb(200, 0, 0) !important; }');
  const { window, close } = await launchApp(['--', basic], { home });
  try {
    await expect.poll(() => articleStyle(window, 'color')).toBe('rgb(200, 0, 0)');
    writeConfig(home, 'profiles/default/custom.css', 'article { color: rgb(0, 0, 200) !important; }');
    await expect.poll(() => articleStyle(window, 'color')).toBe('rgb(0, 0, 200)');
    saveFile(global, 'article { color: rgb(0, 150, 0) !important; }');
    // The profile's file still wins.
    await expect.poll(() => articleStyle(window, 'color')).toBe('rgb(0, 0, 200)');
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('custom CSS cannot hide the tab bar or the status bar (SR-17)', async () => {
  const home = tempHome();
  writeConfig(home, 'custom.css', '* { display: none !important; } :host, html, body { visibility: hidden !important; }');
  const { window, close } = await launchApp(['--', basic], { home });
  try {
    await expect(window.getByTestId('tab-bar')).toBeVisible();
    await expect(window.getByRole('tab')).toBeVisible();
    await expect(window.getByTestId('status-message')).toBeAttached();
    await expect(window.locator('.status-bar')).toBeVisible();
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('custom CSS cannot cover the tab bar or the status bar with a fixed overlay (SR-17)', async () => {
  const home = tempHome();
  writeConfig(
    home,
    'custom.css',
    ':host, .galeo-document { position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; background: rgb(255, 0, 0) !important; }',
  );
  const { window, close } = await launchApp(['--', basic], { home });
  try {
    await expect(window.locator('[data-testid="document"] article')).toBeAttached();
    await expect.poll(() => articleStyle(window, 'color')).not.toBe('');
    for (const testId of ['tab-bar', 'status-bar']) {
      const box = (await window.getByTestId(testId).boundingBox())!;
      const topmost = await window.evaluate(
        ([x, y, id]) => Boolean(document.elementFromPoint(x!, y!)?.closest(`[data-testid="${id}"]`)),
        [box.x + box.width / 2, box.y + box.height / 2, testId] as const,
      );
      expect(topmost, `${testId} is covered`).toBe(true);
    }
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('an oversized custom.css is left untouched and reported; the last good CSS stays', async () => {
  const home = tempHome();
  const file = writeConfig(home, 'custom.css', 'article { color: rgb(200, 0, 0) !important; }');
  const { window, close } = await launchApp(['--', basic], { home });
  try {
    await expect.poll(() => articleStyle(window, 'color')).toBe('rgb(200, 0, 0)');
    saveFile(file, `/* ${'x'.repeat(1024 * 1024)} */ article { color: rgb(0, 0, 200) !important; }`);
    await expect(window.getByTestId('settings-notice')).toContainText(file);
    expect(await articleStyle(window, 'color')).toBe('rgb(200, 0, 0)');
  } finally {
    await close();
    removeTempHome(home);
  }
});

test("a hand edit of profile.json's name shows in the chip and the title at once", async () => {
  const home = tempHome();
  const file = writeConfig(home, 'profiles/default/profile.json', '{"schemaVersion":1}');
  const { app, window, close } = await launchApp(['--', basic], { home });
  try {
    await expect(window.getByTestId('profile-chip')).toHaveAccessibleName('Profile: default');
    saveFile(file, '{"schemaVersion":1,"name":"Home"}');
    await expect(window.getByTestId('profile-chip')).toHaveAccessibleName('Profile: Home');
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getTitle())).toBe('basic.md — Home — galeo');
  } finally {
    await close();
    removeTempHome(home);
  }
});
