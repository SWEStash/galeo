import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, launchSecond, removeTempHome, tempHome } from '../helpers/launch';

// A watched folder (UX F21, ADR-034): what arrives in it is listed, and opens on request.
const panel = (window: Page) => window.getByRole('complementary', { name: 'Watched folder' });
const entries = (window: Page) => panel(window).getByRole('option');
const entry = (window: Page, name: string) => panel(window).getByRole('option', { name: new RegExp(`^${name.replace('.', '\\.')},`) });
const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');

/** A home with a `reports` folder (holding `old.md`) and a document to show. */
function setup() {
  const home = tempHome();
  const folder = path.join(home, 'reports');
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, 'old.md'), '# Old');
  const notes = path.join(home, 'notes.md');
  writeFileSync(notes, '# Notes');
  return { home, folder, notes };
}

test('--watch lists what arrives, newest first; Enter opens it, Ctrl+Enter in a new window; a change makes it changed', async () => {
  const { home, folder, notes } = setup();
  const { app, window, close } = await launchApp(['--watch', folder, '--', notes], { home });
  try {
    await expect(panel(window)).toBeVisible();
    await expect(panel(window).getByTestId('watch-empty')).toHaveText(/^Nothing new yet/);
    const axe = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[data-testid="watch-panel"]').analyze();
    expect(axe.violations).toEqual([]);

    mkdirSync(path.join(folder, 'reviews'));
    writeFileSync(path.join(folder, 'reviews', 'review-auth.md'), '# Review');
    await expect(entry(window, 'review-auth.md')).toHaveAccessibleName(/^review-auth\.md, new, .+, in reviews$/);
    writeFileSync(path.join(folder, 'old.md'), '# Old, edited');
    await expect(entry(window, 'old.md')).toHaveAccessibleName(/^old\.md, changed, /);
    await expect(entries(window)).toHaveCount(2);
    await expect(entries(window).first()).toHaveAccessibleName(/^old\.md/);
    await expect(window.getByTestId('status-watch')).toHaveText('Watching reports/ · 2 new');

    await entry(window, 'review-auth.md').focus();
    await window.keyboard.press('Enter');
    await expect(shownDocument(window).locator('h1')).toHaveText('Review');
    await expect(entry(window, 'review-auth.md')).toHaveAccessibleName(/^review-auth\.md, new, opened, /);
    await expect(window.getByTestId('status-watch')).toHaveText('Watching reports/ · 1 new');

    writeFileSync(path.join(folder, 'reviews', 'review-auth.md'), '# Review, again');
    await expect(entry(window, 'review-auth.md')).toHaveAccessibleName(/^review-auth\.md, changed, opened, /);

    const opened = app.waitForEvent('window');
    await entry(window, 'old.md').focus();
    await window.keyboard.press('ControlOrMeta+Enter');
    const second = await opened;
    await expect(shownDocument(second).locator('h1')).toHaveText('Old, edited');
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('lists only types galeo opens, outside the skip list, to 4 folders deep', async () => {
  const { home, folder, notes } = setup();
  mkdirSync(path.join(folder, 'node_modules', 'x'), { recursive: true });
  mkdirSync(path.join(folder, 'a', 'b', 'c', 'd', 'e'), { recursive: true });
  const { window, close } = await launchApp(['--watch', folder, '--', notes], { home });
  try {
    await expect(panel(window)).toBeVisible();
    writeFileSync(path.join(folder, 'photo.png'), 'png');
    writeFileSync(path.join(folder, 'node_modules', 'x', 'readme.md'), '# x');
    writeFileSync(path.join(folder, 'a', 'b', 'c', 'd', 'e', 'deep.md'), '# deep');
    writeFileSync(path.join(folder, 'a', 'b', 'c', 'd', 'four.md'), '# four');
    // The last one written: once it shows, the others had their chance.
    writeFileSync(path.join(folder, 'last.md'), '# last');
    await expect(entry(window, 'last.md')).toBeVisible();
    await expect(entry(window, 'four.md')).toHaveAccessibleName(/, in a\/b\/c\/d$/);
    await expect(entries(window)).toHaveCount(2);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('Watch folder… in the palette asks main for the folder; Open all new opens the new ones, oldest first', async () => {
  const { home, folder, notes } = setup();
  const { window, close } = await launchApp(['--', notes], { home, env: { GALEO_TEST_WATCH_FOLDER: folder } });
  try {
    await expect(shownDocument(window).locator('h1')).toHaveText('Notes');
    await expect(window.getByTestId('watch-button')).toHaveCount(0);
    await window.keyboard.press('ControlOrMeta+Shift+P');
    await window.getByRole('combobox').fill('Watch folder');
    await window.keyboard.press('Enter');
    await expect(panel(window)).toBeVisible();
    writeFileSync(path.join(folder, 'first.md'), '# First');
    await expect(entry(window, 'first.md')).toBeVisible();
    writeFileSync(path.join(folder, 'second.md'), '# Second');
    await expect(entry(window, 'second.md')).toBeVisible();
    await panel(window).getByRole('button', { name: 'Open all new' }).click();
    await expect(window.getByRole('tab')).toHaveText([/notes\.md/, /first\.md/, /second\.md/]);
    await expect(panel(window).getByRole('button', { name: 'Open all new' })).toBeDisabled();
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('a folder that goes away shows as gone, keeps its list, and is watched again once it is back', async () => {
  const { home, folder, notes } = setup();
  const { window, close } = await launchApp(['--watch', folder, '--', notes], { home });
  try {
    await expect(panel(window)).toBeVisible();
    writeFileSync(path.join(folder, 'a.md'), '# a');
    await expect(entry(window, 'a.md')).toBeVisible();
    rmSync(folder, { recursive: true });
    await expect(panel(window).getByTestId('watch-state')).toHaveText('The folder is gone.');
    await expect(entry(window, 'a.md')).toBeVisible();
    mkdirSync(folder);
    // Checked every few seconds while it is gone.
    await expect(panel(window).getByTestId('watch-state')).toHaveCount(0, { timeout: 10_000 });
    writeFileSync(path.join(folder, 'b.md'), '# b');
    await expect(entry(window, 'b.md')).toBeVisible();
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('the title-bar button counts what is not opened while the panel is closed; Stop watching hides it all', async () => {
  const { home, folder, notes } = setup();
  const { window, close } = await launchApp(['--watch', folder, '--', notes], { home });
  try {
    const button = window.getByRole('button', { name: /^Watched folder/ });
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await window.keyboard.press('ControlOrMeta+Shift+D');
    await expect(panel(window)).toHaveCount(0);
    writeFileSync(path.join(folder, 'a.md'), '# a');
    await expect(button).toHaveAccessibleName('Watched folder, 1 new');
    await button.click();
    await expect(entry(window, 'a.md')).toBeFocused();
    await panel(window).getByRole('button', { name: 'Stop watching' }).click();
    await expect(panel(window)).toHaveCount(0);
    await expect(button).toHaveCount(0);
    await expect(window.getByTestId('status-watch')).toHaveCount(0);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('the watched folder comes back with its window after a restart, its panel as it was left', async () => {
  const { home, folder, notes } = setup();
  const first = await launchApp(['--watch', folder, '--', notes], { home });
  try {
    await expect(panel(first.window)).toBeVisible();
    await first.window.keyboard.press('ControlOrMeta+Shift+D');
    await expect(panel(first.window)).toHaveCount(0);
  } finally {
    await first.close();
  }
  const { window, close } = await launchApp([], { home });
  try {
    await expect(window.getByTestId('status-watch')).toHaveText('Watching reports/');
    await expect(panel(window)).toHaveCount(0);
    writeFileSync(path.join(folder, 'after.md'), '# after');
    await expect(window.getByRole('button', { name: 'Watched folder, 1 new' })).toBeVisible();
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('galeo --watch from a terminal makes the running window watch the folder', async () => {
  const { home, folder, notes } = setup();
  const { window, close } = await launchApp(['--', notes], { home });
  try {
    await expect(shownDocument(window).locator('h1')).toHaveText('Notes');
    expect(launchSecond(home, ['--watch', folder]).status).toBe(0);
    await expect(panel(window)).toBeVisible();
    await expect(window.getByTestId('status-watch')).toHaveText('Watching reports/');
  } finally {
    await close();
    removeTempHome(home);
  }
});
