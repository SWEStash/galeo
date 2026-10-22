import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp } from '../helpers/launch';

// The first start on a machine without a GPU is several seconds slower than every later one: on
// Electron 45 the GPU process comes up ~5 s after the window on a fresh CI runner. CI starts the app
// once before the end-to-end suite, so no test's limit pays for that.
test('the app starts once and shows a document', async () => {
  const { window, close } = await launchApp(['--', path.resolve(import.meta.dirname, '../fixtures/docs/basic.md')]);
  try {
    await expect(window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"] h1')).toBeVisible({ timeout: 90_000 });
  } finally {
    await close();
  }
});
