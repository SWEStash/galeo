import { expect, test } from '@playwright/test';
import { launchApp } from '../helpers/launch';

test('the renderer reads app info over the typed bridge', async () => {
  const { window: page, close } = await launchApp();
  try {
    const info = await page.evaluate(() => window.galeo.app.info());
    expect(info).toMatchObject({ name: 'galeo', sandboxed: true });
    expect(page.url()).toBe('galeo://app/index.html');
  } finally {
    await close();
  }
});

test('main rejects malformed arguments, and the page has no raw IPC access', async () => {
  const { window: page, close } = await launchApp();
  try {
    const result = await page.evaluate(async () => {
      const info = window.galeo.app.info as unknown as (arg: unknown) => Promise<unknown>;
      try {
        await info('unexpected');
        return 'resolved';
      } catch (error) {
        return String(error);
      }
    });
    expect(result).toContain('app.info: invalid arguments');
    expect(await page.evaluate(() => 'ipcRenderer' in window || 'require' in window)).toBe(false);
  } finally {
    await close();
  }
});
