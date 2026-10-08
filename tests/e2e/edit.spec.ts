import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { launchApp, removeTempHome, tempHome } from '../helpers/launch';

const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const indicator = (window: Page, words: string) => window.locator(`.tab-indicator[data-indicator="${words}"]`);

test('Ctrl+E edits the shown file, Ctrl+S saves it with its own line endings, and Ctrl+E reads again', async () => {
  const dir = tempHome();
  const file = path.join(dir, 'notes.md');
  writeFileSync(file, '# Notes\r\n\r\nFirst line.\r\n');
  const { app, window, close } = await launchApp(['--', file]);
  try {
    await expect(shownDocument(window).locator('h1')).toHaveText('Notes');
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Editing');
    await expect(indicator(window, 'edit mode')).toBeAttached();
    const editor = shownDocument(window).locator('.cm-content');
    await expect(editor).toBeFocused();

    await window.keyboard.press('Control+End');
    await window.keyboard.type('Second line.');
    await expect(indicator(window, 'unsaved changes')).toBeAttached();
    await window.keyboard.press('Control+s');
    await expect(window.getByTestId('status-message')).toHaveText('Saved');
    await expect(indicator(window, 'unsaved changes')).toHaveCount(0);
    expect(readFileSync(file, 'utf8')).toBe('# Notes\r\n\r\nFirst line.\r\nSecond line.');

    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Read-only');
    await expect(indicator(window, 'edit mode')).toHaveCount(0);
  } finally {
    await close();
    removeTempHome(dir);
  }
});
