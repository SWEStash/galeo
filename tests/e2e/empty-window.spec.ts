import AxeBuilder from '@axe-core/playwright';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, tempHome } from '../helpers/launch';

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const basic = path.join(docs, 'basic.md');
const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');

test('a window without tabs shows how to open files and the recent ones, and passes axe', async () => {
  const home = tempHome();
  try {
    const first = await launchApp(['--', basic], { home });
    await expect(shownDocument(first.window)).toBeVisible();
    await first.window.keyboard.press('ControlOrMeta+W');
    const empty = first.window.getByTestId('empty-window');
    await expect(empty).toContainText('Drop files here');
    await expect(empty).toContainText('Ctrl+P');
    await expect(empty.getByRole('button', { name: /basic\.md/ })).toBeVisible();
    const results = await new AxeBuilder({ page: first.window }).setLegacyMode(true).include('.empty-window').analyze();
    expect(results.violations).toEqual([]);

    await empty.getByRole('button', { name: /basic\.md/ }).click();
    await expect(first.window.getByRole('tab')).toHaveText(['basic.md✕']);
    await expect(shownDocument(first.window).locator('h1')).toBeVisible();
    await first.close();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('the page can only open a recent file by the id main offered it', async () => {
  const home = tempHome();
  try {
    const app = await launchApp(['--', basic], { home });
    try {
      await expect(shownDocument(app.window)).toBeVisible();
      const refused = await app.window.evaluate(async () => {
        await window.galeo.recent.list();
        return window.galeo.recent.open('/etc/passwd').then(
          () => 'opened',
          () => 'refused',
        );
      });
      expect(refused).toBe('refused');
      await expect(app.window.getByRole('tab')).toHaveCount(1);
    } finally {
      await app.close();
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Clear recent empties the list, on disk too', async () => {
  const home = tempHome();
  try {
    const app = await launchApp(['--', basic], { home });
    try {
      await expect(shownDocument(app.window)).toBeVisible();
      await app.window.keyboard.press('ControlOrMeta+W');
      const empty = app.window.getByTestId('empty-window');
      await empty.getByRole('button', { name: 'Clear recent' }).click();
      await expect(empty.getByRole('button', { name: /basic\.md/ })).toHaveCount(0);
      const recent = path.join(home, 'state', 'galeo', 'profiles', 'default', 'recent.json');
      await expect.poll(() => JSON.parse(readFileSync(recent, 'utf8')).files).toEqual([]);
    } finally {
      await app.close();
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
