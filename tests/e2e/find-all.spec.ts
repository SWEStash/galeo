import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { launchApp, removeTempHome, tempHome } from '../helpers/launch';

const findAll = (window: Page) => window.getByTestId('find-all');
const field = (window: Page) => findAll(window).getByRole('combobox');
const group = (window: Page, name: RegExp) => findAll(window).getByRole('group', { name });
const selected = (window: Page) => window.getByRole('tab', { selected: true });
const shownPanel = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"]');
const shownDocument = (window: Page) => shownPanel(window).locator('[data-testid="document"]');
const findBar = (window: Page) => shownPanel(window).getByRole('searchbox', { name: 'Find in document' });
const findStatus = (window: Page) => shownPanel(window).locator('.find-bar [role="status"]');

/** Four tabs: Markdown shown first; a log, JSON and a file with no match behind it, never shown. */
async function withTabs(run: (window: Page, app: Awaited<ReturnType<typeof launchApp>>['app']) => Promise<void>) {
  const dir = tempHome();
  const files = {
    'notes.md': '# Notes\n\nA needle one.\n\nSecond paragraph.\n\nThe needle two.\n\nThird needle.\n',
    'app.log': 'start\nneedle in the log\nok\nneedle again\n',
    'data.json': '{ "name": "needle" }\n',
    'plain.md': '# Nothing here\n',
  };
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text);
  const { app, window, close } = await launchApp(['--', ...Object.keys(files).map((name) => path.join(dir, name))]);
  try {
    await expect(window.getByRole('tab')).toHaveCount(4);
    await expect(selected(window)).toContainText('notes.md');
    await expect(shownDocument(window).locator('h1')).toHaveText('Notes');
    await run(window, app);
  } finally {
    await close();
    removeTempHome(dir);
  }
}

/** Moves the highlight down to the option at `index` (typing already highlights the first). */
async function highlight(window: Page, index: number) {
  const option = findAll(window).getByRole('option').nth(index);
  for (let presses = 0; presses <= index && (await option.getAttribute('data-focused')) === null; presses++) await window.keyboard.press('ArrowDown');
  await expect(option).toHaveAttribute('data-focused');
}

async function search(window: Page, query: string) {
  await window.keyboard.press('ControlOrMeta+Shift+F');
  await expect(field(window)).toBeFocused();
  await field(window).fill(query);
}

test("Ctrl+Shift+F lists each tab's matches, tabs never shown included, passes axe, and Esc gives focus back", async () => {
  await withTabs(async (window) => {
    await search(window, 'needle');
    await expect(group(window, /^notes\.md .* · 3 matches$/).getByRole('option')).toHaveCount(3);
    await expect(group(window, /^app\.log .* · 2 matches$/).getByRole('option')).toHaveCount(2);
    await expect(group(window, /^data\.json .* · 1 match$/).getByRole('option')).toHaveCount(1);
    await expect(findAll(window).getByRole('group')).toHaveCount(3);
    await expect(findAll(window).getByTestId('find-all-status')).toHaveText('6 matches in 3 tabs');
    const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[data-testid="find-all"]').analyze();
    expect(results.violations).toEqual([]);
    await window.keyboard.press('Escape');
    await expect(findAll(window)).toHaveCount(0);
    await expect(shownDocument(window)).toBeFocused();
  });
});

test("Enter on a match opens its tab with the find bar on it, in the source view", async () => {
  await withTabs(async (window) => {
    await search(window, 'needle');
    await expect(findAll(window).getByRole('option')).toHaveCount(6);
    // notes.md's three, then app.log's second match (line 4).
    await highlight(window, 4);
    await window.keyboard.press('Enter');
    await expect(findAll(window)).toHaveCount(0);
    await expect(selected(window)).toContainText('app.log');
    await expect(findBar(window)).toHaveValue('needle');
    await expect(findBar(window)).toBeFocused();
    await expect(findStatus(window)).toHaveText('2 of 2');
  });
});

test('in the reader, the find bar lands on the rendered match of the chosen line', async () => {
  await withTabs(async (window) => {
    await window.keyboard.press('ControlOrMeta+2');
    await expect(selected(window)).toContainText('app.log');
    await search(window, 'needle');
    await expect(findAll(window).getByRole('option')).toHaveCount(6);
    // notes.md's second match (line 7).
    await highlight(window, 1);
    await window.keyboard.press('Enter');
    await expect(selected(window)).toContainText('notes.md');
    await expect(shownDocument(window).locator('h1')).toHaveText('Notes');
    await expect(findStatus(window)).toHaveText('2 of 3');
  });
});

test('a JSON tree shows its source for a match chosen there', async () => {
  await withTabs(async (window) => {
    await search(window, 'needle');
    await group(window, /^data\.json/).getByRole('option').click();
    await expect(selected(window)).toContainText('data.json');
    await expect(shownDocument(window).locator('.cm-content')).toBeVisible();
    await expect(findStatus(window)).toHaveText('1 of 1');
  });
});

test('a tab with unsaved changes is searched as it is on screen', async () => {
  await withTabs(async (window, app) => {
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Editing');
    await expect(shownDocument(window).locator('.cm-content')).toBeFocused();
    await window.keyboard.press('Control+End');
    await window.keyboard.type('\nAn unsavedword.');
    await search(window, 'unsavedword');
    await expect(group(window, /^notes\.md .* · 1 match$/).getByRole('option')).toHaveCount(1);
    // Saved, so the window closes without asking about unsaved changes.
    await window.keyboard.press('Escape');
    await window.keyboard.press('Control+s');
    await expect(window.getByTestId('status-message')).toHaveText('Saved');
  });
});
