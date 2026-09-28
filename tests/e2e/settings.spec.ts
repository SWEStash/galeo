import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, tempHome } from '../helpers/launch';

function withSettings(content: string) {
  const home = tempHome();
  const file = path.join(home, 'config', 'galeo', 'settings.json');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return { home, file, remove: () => rmSync(home, { recursive: true, force: true }) };
}

test('a hand edit to settings.json applies live', async () => {
  const { home, file, remove } = withSettings('{"schemaVersion":1,"themeMode":"dark"}');
  const { window, close } = await launchApp([], { home });
  try {
    const root = window.locator('html');
    await expect(root).toHaveAttribute('data-scheme', 'dark');
    writeFileSync(file, '{"schemaVersion":1,"themeMode":"light"}');
    await expect(root).toHaveAttribute('data-scheme', 'light');
  } finally {
    await close();
    remove();
  }
});

test('an invalid hand edit is left untouched and reported, and the last valid settings stay', async () => {
  const { home, file, remove } = withSettings('{"schemaVersion":1,"themeMode":"dark"}');
  const { app, window, close } = await launchApp([], { home });
  try {
    await expect(window.locator('html')).toHaveAttribute('data-scheme', 'dark');
    const broken = '{"schemaVersion":1,"themeMode":"light",}';
    writeFileSync(file, broken);
    await expect
      .poll(() => app.evaluate(() => (globalThis as { __galeoSettingsNotices?: { path: string }[] }).__galeoSettingsNotices))
      .toEqual([expect.objectContaining({ path: file, reason: 'invalid' })]);
    await expect(window.locator('html')).toHaveAttribute('data-scheme', 'dark');
    expect(readFileSync(file, 'utf8')).toBe(broken);
  } finally {
    await close();
    remove();
  }
});

test('the config, state and cache folders are owner-only', async () => {
  test.skip(process.platform === 'win32', 'POSIX modes');
  const { home, close } = await launchApp();
  try {
    for (const dir of ['config/galeo', 'state/galeo', 'cache/galeo', 'config/galeo/profiles/default']) {
      expect(statSync(path.join(home, dir)).mode & 0o777, dir).toBe(0o700);
    }
  } finally {
    await close();
  }
});
