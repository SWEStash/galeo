import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, removeTempHome, tempHome } from '../helpers/launch';

// The document's right-click menu (UX F11, mouse paths review): main builds it and acts on Edit and
// the file entries; the page runs the rest as their commands.
const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const answer = (app: ElectronApplication, choice: string) => app.evaluate((_electron, value) => void (process.env['GALEO_TEST_MENU_CHOICE'] = value), choice);
const lastMenu = async (app: ElectronApplication) =>
  ((await app.evaluate(() => (globalThis as { __galeoMenus?: { label: string; enabled?: boolean }[][] }).__galeoMenus ?? [])).at(-1) ?? []).map(
    (item) => `${item.label}${item.enabled === false ? ' (off)' : ''}`,
  );

test('Back, Find and Edit, then Save, from the menu run as their keys do', async () => {
  const dir = tempHome();
  const file = path.join(dir, 'notes.md');
  writeFileSync(file, '# Notes\n\n[Other](other.md)\n');
  writeFileSync(path.join(dir, 'other.md'), '# Other\n');
  const { app, window, close } = await launchApp(['--', file], { env: { GALEO_TEST_MENU_CHOICE: 'none' } });
  try {
    await expect(shownDocument(window).locator('h1')).toHaveText('Notes');
    await shownDocument(window).getByRole('link', { name: 'Other' }).click();
    await expect(shownDocument(window).locator('h1')).toHaveText('Other');

    await shownDocument(window).click({ button: 'right' });
    await expect.poll(() => lastMenu(app)).toEqual(['Back', 'Forward (off)', 'Find…', 'Reload', 'Edit', 'Copy as rich text', 'Export to PDF…', 'Open with default app', 'Reveal in Files', 'Copy path']);
    await answer(app, 'back');
    await shownDocument(window).click({ button: 'right' });
    await expect(shownDocument(window).locator('h1')).toHaveText('Notes');

    await answer(app, 'find');
    await shownDocument(window).click({ button: 'right' });
    await expect(window.getByRole('searchbox')).toBeFocused();
    await window.keyboard.press('Escape');

    // Edit is main's own: the file came from the command line, so it edits without asking.
    await answer(app, 'edit');
    await shownDocument(window).locator('h1').click({ button: 'right' });
    await expect(window.getByTestId('status-mode')).toHaveText('Editing');
    await expect(shownDocument(window).locator('.cm-content')).toBeFocused();
    await window.keyboard.press('ControlOrMeta+End');
    await window.keyboard.type('More.');
    await window.waitForTimeout(1200);
    await answer(app, 'save');
    await shownDocument(window).locator('.cm-content').click({ button: 'right' });
    await expect(window.getByTestId('status-message')).toHaveText('Saved');
    expect(readFileSync(file, 'utf8')).toContain('More.');
    expect(await lastMenu(app)).toContain('Save');
  } finally {
    await close();
    removeTempHome(dir);
  }
});

test("a JSON tree's menu offers Expand all, Collapse all and Copy JSON path", async () => {
  const dir = tempHome();
  const file = path.join(dir, 'data.json');
  writeFileSync(file, JSON.stringify({ name: 'galeo', items: [{ id: 1 }, { id: 2 }] }, null, 2));
  const { app, window, close } = await launchApp(['--', file], { env: { GALEO_TEST_MENU_CHOICE: 'expand-all' } });
  try {
    const rows = shownDocument(window).locator('[role=treeitem]');
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    await rows.first().click({ button: 'right' });
    await expect.poll(() => rows.count()).toBeGreaterThan(count);
    expect((await lastMenu(app)).slice(5, 8)).toEqual(['Expand all', 'Collapse all', 'Copy JSON path']);
    await answer(app, 'collapse-all');
    await rows.first().click({ button: 'right' });
    await expect.poll(() => rows.count()).toBeLessThanOrEqual(count);
  } finally {
    await close();
    removeTempHome(dir);
  }
});

test('the palette\'s Open with default app shows the same menu', async () => {
  const { app, window, close } = await launchApp(['--', path.join(docs, 'basic.md')], { env: { GALEO_TEST_MENU_CHOICE: 'none' } });
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+Shift+P');
    await window.getByTestId('palette').getByRole('combobox').fill('Open with default app');
    await window.keyboard.press('Enter');
    await expect.poll(() => lastMenu(app)).toContain('Open with default app');
  } finally {
    await close();
  }
});
