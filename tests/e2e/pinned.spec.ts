import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { appDirs, launchApp, removeTempHome, tempHome } from '../helpers/launch';

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const files = ['basic.md', 'gfm.md', 'math.md'].map((name) => path.join(docs, name));
const palette = (window: Page) => window.getByTestId('palette');
const tabNames = (window: Page) => window.getByRole('tab').evaluateAll((tabs) => tabs.map((tab) => tab.textContent));

async function run(window: Page, query: string) {
  await window.keyboard.press('ControlOrMeta+Shift+P');
  await palette(window).getByRole('combobox').fill(query);
  await window.keyboard.press('Enter');
  await expect(palette(window)).toHaveCount(0);
}

test('Pin or unpin tab moves the shown tab first, with a pin and "pinned" in its name, and a restart keeps it', async () => {
  const home = tempHome();
  try {
    const first = await launchApp(['--', ...files], { home });
    try {
      const { window } = first;
      await expect(window.getByRole('tab')).toHaveCount(3);
      await window.getByRole('tab', { name: /math\.md/ }).click();
      await run(window, 'Pin or unpin tab');
      await expect(window.getByRole('tab').first()).toHaveAccessibleName(/^math\.md ?, pinned/);
      await expect(window.getByRole('tab').first().locator('.tab-pin')).toBeVisible();
      await expect(window.getByRole('tab').first().locator('.tab-close')).toHaveCount(0);
      expect((await tabNames(window)).map((name) => name?.split(',')[0])).toEqual(['math.md', 'basic.md', 'gfm.md']);
      // Ctrl+Shift+PgDn keeps a pinned tab in its block: it is the only one, so it stays first.
      await window.keyboard.press('ControlOrMeta+Shift+PageDown');
      await expect.poll(async () => (await tabNames(window))[0]).toMatch(/^math\.md/);
      // The session is written 2 s after the last change.
      const session = path.join(appDirs(home).state, 'profiles', 'default', 'session.json');
      await expect.poll(() => existsSync(session) && readFileSync(session, 'utf8').includes('"pinned": true'), { timeout: 15_000 }).toBe(true);
    } finally {
      await first.close();
    }

    const second = await launchApp([], { home });
    try {
      const { window } = second;
      await expect(window.getByRole('tab')).toHaveCount(3);
      await expect(window.getByRole('tab').first()).toHaveAccessibleName(/^math\.md ?, pinned/);
      await window.getByRole('tab').first().click();
      await run(window, 'Pin or unpin tab');
      await expect(window.getByRole('tab').first()).toHaveAccessibleName(/^math\.md(?! ?, pinned)/);
      await expect(window.getByRole('tab').first().locator('.tab-pin')).toHaveCount(0);
    } finally {
      await second.close();
    }
  } finally {
    removeTempHome(home);
  }
});
