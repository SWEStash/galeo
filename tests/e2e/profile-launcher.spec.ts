import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, removeTempHome, tempHome } from '../helpers/launch';

// A profile's launcher (#60, Linux): "galeo — <profile>" in the user's applications (the test's own).
test.skip(process.platform !== 'linux', 'desktop entries are Linux only');
const basic = path.resolve(import.meta.dirname, '../fixtures/docs/basic.md');

test("Settings adds this profile's launcher to the applications and removes it again", async () => {
  const home = tempHome();
  const entry = path.join(home, 'data', 'applications', 'galeo-profile-default.desktop');
  const { window, close } = await launchApp(['--', basic], { home, env: { GALEO_TEST_PROFILE_LAUNCHER_EXEC: '/opt/galeo/galeo' } });
  try {
    await expect(window.getByRole('tab')).toHaveCount(1);
    await window.keyboard.press('ControlOrMeta+Comma');
    await expect(window.getByTestId('settings-view')).toBeVisible();
    const result = window.getByTestId('profile-launcher-result');
    await window.getByRole('button', { name: 'Add to applications' }).click();
    await expect(result).toHaveText('Added “galeo — default” to your applications.');
    const text = readFileSync(entry, 'utf8');
    expect(text).toContain('Name=galeo — default');
    expect(text).toContain('Exec=/opt/galeo/galeo --profile default -- %F');
    await window.getByRole('button', { name: 'Remove from applications' }).click();
    await expect(result).toHaveText('Removed “galeo — default” from your applications.');
    expect(existsSync(entry)).toBe(false);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('without a galeo command to run, Settings says why it adds nothing', async () => {
  const home = tempHome();
  const { window, close } = await launchApp(['--', basic], { home });
  try {
    await expect(window.getByRole('tab')).toHaveCount(1);
    await window.keyboard.press('ControlOrMeta+Comma');
    await expect(window.getByTestId('settings-view')).toBeVisible();
    await window.getByRole('button', { name: 'Add to applications' }).click();
    await expect(window.getByTestId('profile-launcher-result')).toContainText('Not added: this copy of galeo has no command');
    expect(existsSync(path.join(home, 'data', 'applications'))).toBe(false);
  } finally {
    await close();
    removeTempHome(home);
  }
});
