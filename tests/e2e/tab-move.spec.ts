import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { appDirs, launchApp, launchSecond, removeTempHome, tempHome } from '../helpers/launch';
import { saveFile } from '../helpers/save';
import { crossEdge, dropTab, endDrag, endDragOutside, startDragging } from '../helpers/tab-drag';

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const [basic, gfm, math] = ['basic.md', 'gfm.md', 'math.md'].map((name) => path.join(docs, name)) as [string, string, string];

const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const indicator = (window: Page, words: string) => window.locator(`.tab-indicator[data-indicator="${words}"]`);
const snapshot = (page: Page) => page.evaluate(() => window.galeo.tabs.snapshot());
const paths = async (page: Page) => (await snapshot(page)).tabs.map((tab) => tab.path);
const shownPath = async (page: Page) => {
  const { tabs, active } = await snapshot(page);
  return tabs.find((tab) => tab.id === active)?.path ?? null;
};
const idOf = async (page: Page, file: string) => (await snapshot(page)).tabs.find((tab) => tab.path === file)!.id;

/** Runs a palette entry by a click, as a reader does: the click is real input main sees. */
async function choose(window: Page, label: string) {
  await window.keyboard.press('ControlOrMeta+Shift+P');
  const palette = window.getByTestId('palette');
  await palette.getByRole('combobox').fill(label);
  await palette.getByRole('option', { name: label }).click();
  await expect(palette).toHaveCount(0);
}

/** Opens a second window of the profile showing `files`. */
async function secondWindow(app: ElectronApplication, home: string, args: string[]) {
  const opened = app.waitForEvent('window');
  expect(launchSecond(home, args).status).toBe(0);
  return opened;
}

/** A temp home whose settings pick a theme. */
function homeWith(theme: 'light' | 'dark') {
  const home = tempHome();
  const settings = path.join(appDirs(home).config, 'settings.json');
  mkdirSync(path.dirname(settings), { recursive: true });
  saveFile(settings, `{"schemaVersion":1,"themeMode":"${theme}"}`);
  return home;
}

for (const theme of ['light', 'dark'] as const) {
  test(`the palette moves a tab to another window, which keeps its zoom, width and view, and lists windows that pass axe (${theme})`, async () => {
    const home = homeWith(theme);
    const { app, window, close } = await launchApp(['--', basic, gfm], { home });
    try {
      await expect(shownDocument(window).locator('h1')).toBeVisible();
      const other = await secondWindow(app, home, ['--new-window', '--', math]);
      await expect.poll(() => paths(other)).toEqual([math]);
      const id = await idOf(window, basic);
      await window.keyboard.press('ControlOrMeta+Equal');
      await window.keyboard.press('Alt+Equal');
      await window.keyboard.press('ControlOrMeta+Backslash');
      await expect(window.getByTestId('status-view')).toHaveText('Split');

      await window.keyboard.press('ControlOrMeta+Shift+P');
      await window.getByTestId('palette').getByRole('combobox').fill('Move tab to window');
      await window.getByTestId('palette').getByRole('option', { name: 'Move tab to window…' }).click();
      const list = window.getByTestId('move-tab');
      await expect(list.getByRole('option')).toHaveText(['default math.md']);
      const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[data-testid="move-tab"]').analyze();
      expect(results.violations).toEqual([]);
      await list.getByRole('option').click();

      await expect.poll(() => paths(other)).toEqual([math, basic]);
      expect(await paths(window)).toEqual([gfm]);
      const moved = (await snapshot(other)).tabs.find((tab) => tab.id === id)!;
      expect(moved).toMatchObject({ zoom: 1.1, width: 80, view: 'split' });
      await expect.poll(() => shownPath(other)).toBe(basic);
      await expect(shownDocument(other).locator('h1').first()).toBeVisible();
      await expect(other.getByTestId('status-view')).toHaveText('Split');
    } finally {
      await close();
      removeTempHome(home);
    }
  });
}

test("a window's last tab moved into another profile's window closes it, and each profile's session says where the tab is", async () => {
  const home = tempHome();
  const { app, window, close } = await launchApp(['--', basic], { home });
  let quit = false;
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    const work = await secondWindow(app, home, ['--profile', 'work', '--', gfm]);
    await expect.poll(() => paths(work)).toEqual([gfm]);
    const gone = window.waitForEvent('close');
    await choose(window, 'Move tab to window…');
    await window.getByTestId('move-tab').getByRole('option', { name: /^work/ }).click();
    await gone;
    await expect.poll(() => paths(work)).toEqual([gfm, basic]);
    expect(app.windows()).toHaveLength(1);

    const exited = app.waitForEvent('close');
    await pressInMain(app, work, 'Q', process.platform !== 'darwin');
    await exited;
    quit = true;
    const session = (profile: string) => JSON.parse(readFileSync(path.join(appDirs(home).state, 'profiles', profile, 'session.json'), 'utf8'));
    const files = (profile: string) => session(profile).windows.flatMap((each: { tabs: { entries: { path: string }[]; index: number }[] }) => each.tabs.map((tab) => tab.entries[tab.index]!.path));
    expect(session('default').windows).toEqual([]);
    expect(files('work')).toEqual([gfm, basic]);
  } finally {
    if (!quit) await close();
    removeTempHome(home);
  }
});

test('a tab with unsaved changes moves with them, in edit mode, and a clean one in edit mode stays editable', async () => {
  const home = tempHome();
  const dir = path.join(home, 'docs');
  mkdirSync(dir);
  const [notes, plan, other] = ['notes.md', 'plan.md', 'other.md'].map((name) => path.join(dir, name)) as [string, string, string];
  writeFileSync(notes, '# Notes\n');
  writeFileSync(plan, '# Plan\n');
  writeFileSync(other, '# Other\n');
  const { app, window, close } = await launchApp(['--', notes, plan, other], { home });
  try {
    await expect(shownDocument(window).locator('h1')).toHaveText('Notes');
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Editing');
    await expect(shownDocument(window).locator('.cm-content')).toBeFocused();
    await window.keyboard.press('Control+End');
    await window.keyboard.type('Mine.');
    await expect(indicator(window, 'unsaved changes')).toBeAttached();
    // At once: main has the last keys before the tab leaves.
    const opened = app.waitForEvent('window');
    await choose(window, 'Move tab to new window');
    const moved = await opened;
    await expect.poll(() => paths(moved)).toEqual([notes]);
    await expect(indicator(moved, 'unsaved changes')).toBeAttached();
    await expect(moved.getByTestId('status-mode')).toHaveText('Editing');
    await expect(shownDocument(moved).locator('.cm-content')).toContainText('# NotesMine.');
    expect(readFileSync(notes, 'utf8')).toBe('# Notes\n');
    await expect.poll(() => paths(window)).toEqual([plan, other]);

    // A clean tab in edit mode.
    await window.keyboard.press('ControlOrMeta+1');
    await expect(shownDocument(window).locator('h1')).toHaveText('Plan');
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Editing');
    await choose(window, 'Move tab to window…');
    await window.getByTestId('move-tab').getByRole('option').click();
    await expect.poll(() => paths(moved)).toEqual([notes, plan]);
    await expect(moved.getByTestId('status-mode')).toHaveText('Editing');
    await expect(indicator(moved, 'unsaved changes')).toHaveCount(1);

    // The moved tab's edit grant came along: it saves its file.
    await moved.keyboard.press('ControlOrMeta+1');
    await expect(indicator(moved, 'unsaved changes')).toBeAttached();
    await expect(shownDocument(moved).locator('.cm-content')).toBeVisible();
    await shownDocument(moved).locator('.cm-content').click();
    await moved.keyboard.press('ControlOrMeta+s');
    await expect(moved.getByTestId('status-message')).toHaveText('Saved');
    expect(readFileSync(notes, 'utf8')).toBe('# Notes\nMine.');
  } finally {
    await close();
    removeTempHome(home);
  }
});

test("the Settings tab and a window's only tab stay, and say why", async () => {
  const { window, close } = await launchApp(['--', basic]);
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    await choose(window, 'Move tab to new window');
    await expect(window.getByTestId('status-message')).toHaveText("It's this window's only tab");
    await window.keyboard.press('ControlOrMeta+Comma');
    await expect(window.getByRole('tab', { name: /Settings/ })).toHaveAttribute('aria-selected', 'true');
    await choose(window, 'Move tab to window…');
    await expect(window.getByTestId('status-message')).toHaveText('The Settings tab stays in its window');
    await expect(window.getByTestId('move-tab')).toHaveCount(0);
  } finally {
    await close();
  }
});

test("a tab dragged onto another window's empty tab bar moves there", async () => {
  const { app, window, close } = await launchApp(['--', basic, gfm]);
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    const opened = app.waitForEvent('window');
    await pressInMain(app, window, 'N');
    const empty = await opened;
    await expect(empty.getByTestId('empty-window')).toBeVisible();
    const token = await startDragging(window, basic);
    // Every window's tab bar takes the drop while the drag lasts, not only beside a tab.
    await expect(empty.getByTestId('tab-bar')).toHaveAttribute('data-tab-drag', 'true');
    const strip = (await empty.locator('.tab-strip').boundingBox())!;
    await dropTab(empty, token, { x: strip.x + strip.width / 2, y: strip.y + strip.height / 2 });
    await window.mouse.up();

    await expect.poll(() => paths(empty)).toEqual([basic]);
    await expect.poll(() => shownPath(empty)).toBe(basic);
    await expect.poll(() => paths(window)).toEqual([gfm]);
    await expect(empty.getByTestId('tab-bar')).not.toHaveAttribute('data-tab-drag');
  } finally {
    await close();
  }
});

test("a drop that names the dragged tab by its id, not the drag's token, takes nothing (ADR-022)", async () => {
  const { app, window, close } = await launchApp(['--', basic, gfm]);
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    const opened = app.waitForEvent('window');
    await pressInMain(app, window, 'N');
    const empty = await opened;
    await expect(empty.getByTestId('empty-window')).toBeVisible();
    const id = await idOf(window, basic);
    await startDragging(window, basic);
    await expect(empty.getByTestId('tab-bar')).toHaveAttribute('data-tab-drag', 'true');
    const strip = (await empty.locator('.tab-strip').boundingBox())!;
    await dropTab(empty, id, { x: strip.x + strip.width / 2, y: strip.y + strip.height / 2 });
    await window.mouse.up();

    await expect(empty.getByTestId('tab-bar')).not.toHaveAttribute('data-tab-drag');
    // The drop took nothing (the source may still tear the tab off: its drag ended unclaimed).
    expect(await paths(empty)).toEqual([]);
  } finally {
    await close();
  }
});

test('a window opened while a tab is being dragged takes the drop on its empty tab bar too', async () => {
  const { app, window, close } = await launchApp(['--', basic, gfm]);
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    const token = await startDragging(window, basic);
    await expect(window.getByTestId('tab-bar')).toHaveAttribute('data-tab-drag', 'true');

    const opened = app.waitForEvent('window');
    await pressInMain(app, window, 'N');
    const late = await opened;
    await expect(late.getByTestId('empty-window')).toBeVisible();
    await expect(late.getByTestId('tab-bar')).toHaveAttribute('data-tab-drag', 'true');
    const strip = (await late.locator('.tab-strip').boundingBox())!;
    await dropTab(late, token, { x: strip.x + strip.width / 2, y: strip.y + strip.height / 2 });
    await window.mouse.up();

    await expect.poll(() => paths(late)).toEqual([basic]);
    await expect.poll(() => paths(window)).toEqual([gfm]);
    await expect(late.getByTestId('tab-bar')).not.toHaveAttribute('data-tab-drag');
  } finally {
    await close();
  }
});

const leaves = [
  { dropEffect: 'none', across: '.drop-area', how: 'on the desktop, leaving across the document' },
  { dropEffect: 'copy', across: '.tab-grab', how: 'over an app that took the drop, leaving across the tabs' },
] as const;
for (const { dropEffect, across, how } of leaves) {
  test(`a tab dropped outside every galeo window gets a window of its own, ${how}; the one it left keeps its other tabs`, async () => {
    const { app, window, close } = await launchApp(['--', basic, gfm]);
    try {
      await expect(shownDocument(window).locator('h1')).toBeVisible();
      await startDragging(window, basic);
      await expect(window.getByTestId('tab-bar')).toHaveAttribute('data-tab-drag', 'true');
      const opened = app.waitForEvent('window');
      await endDragOutside(window, 'basic.md', dropEffect, across);
      const torn = await opened;
      await window.mouse.up();
      await expect.poll(() => paths(torn)).toEqual([basic]);
      await expect.poll(() => paths(window)).toEqual([gfm]);
    } finally {
      await close();
    }
  });
}

test('a tab dragged out and back in over the document is not torn off when the drag ends in its window', async () => {
  const { app, window, close } = await launchApp(['--', basic, gfm]);
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    await startDragging(window, basic);
    await expect(window.getByTestId('tab-bar')).toHaveAttribute('data-tab-drag', 'true');
    await crossEdge(window, 'dragleave', '.tab-bar');
    await crossEdge(window, 'dragenter', '.drop-area');
    await endDrag(window, 'basic.md', 'none');
    await window.mouse.up();
    await expect(window.getByTestId('tab-bar')).not.toHaveAttribute('data-tab-drag');
    // A tear-off would open its window right after the drag settles.
    await window.waitForTimeout(1000);
    expect(app.windows()).toHaveLength(1);
    expect(await paths(window)).toEqual([basic, gfm]);
  } finally {
    await close();
  }
});

test('a tab dropped on another window still moves there when that window asks for it after the drag ended, and gets no window of its own', async () => {
  const { app, window, home, close } = await launchApp(['--', basic, gfm]);
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    const other = await secondWindow(app, home, ['--new-window', '--', math]);
    await expect(other.getByRole('tab')).toHaveCount(1);
    const token = await startDragging(window, basic);
    await expect(other.getByTestId('tab-bar')).toHaveAttribute('data-tab-drag', 'true');
    // Where it lands is measured first: main keeps an ended drag claimable for half a second only.
    const tab = (await other.getByRole('tab').first().boundingBox())!;
    // The source hears the drag ended before the window it was dropped on asks for the tab.
    await endDragOutside(window, 'basic.md', 'none');
    await dropTab(other, token, { x: tab.x + tab.width * 0.75, y: tab.y + tab.height / 2 });
    await window.mouse.up();

    await expect.poll(() => paths(other)).toEqual([math, basic]);
    await expect.poll(() => paths(window)).toEqual([gfm]);
    await expect(other.getByTestId('tab-bar')).not.toHaveAttribute('data-tab-drag');
    expect(app.windows()).toHaveLength(2);
  } finally {
    await close();
  }
});
