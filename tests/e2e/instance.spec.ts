import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import electronBinary from 'electron';
import { launchApp } from '../helpers/launch';

const ROOT = path.resolve(import.meta.dirname, '../..');

test("Chromium's data goes to the state and cache directories, not config", async () => {
  // The test isolates the app through XDG variables, which only Linux reads.
  test.skip(process.platform !== 'linux', 'XDG directories are Linux-only');
  const { window: page, home, close } = await launchApp();
  try {
    await expect(page.getByTestId('app-root')).toHaveAttribute('data-worker', 'ready');
    expect(existsSync(path.join(home, 'state', 'galeo', 'chromium'))).toBe(true);
    expect(existsSync(path.join(home, 'cache', 'galeo'))).toBe(true);
    const config = path.join(home, 'config', 'galeo');
    expect(existsSync(config) ? readdirSync(config) : []).toEqual([]);
  } finally {
    await close();
  }
});

test('a second launch hands over to the running instance and exits', async () => {
  const { app, window: page, home, close } = await launchApp();
  try {
    await expect(page.getByTestId('app-root')).toHaveAttribute('data-worker', 'ready');
    const second = spawnSync(electronBinary as unknown as string, ['.', '--', 'notes.md'], {
      cwd: ROOT,
      timeout: 15_000,
      env: {
        ...process.env,
        XDG_CONFIG_HOME: path.join(home, 'config'),
        XDG_STATE_HOME: path.join(home, 'state'),
        XDG_CACHE_HOME: path.join(home, 'cache'),
      },
    });
    expect(second.status).toBe(0);
    expect(app.windows()).toHaveLength(1);
  } finally {
    await close();
  }
});
