import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { appDirs, launchApp, launchSecond, removeTempHome, tempHome } from '../helpers/launch';
import { saveFile } from '../helpers/save';
import { crossEdge, dropFiles, dropTab, endDrag, endDragOutside, startDragging } from '../helpers/tab-drag';

// Tabs on the left (ADR-023, UX F18): the side panel, its divider and its collapsed strip.

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const [basic, gfm, math] = ['basic.md', 'gfm.md', 'math.md'].map((name) => path.join(docs, name)) as [string, string, string];

const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const snapshot = (page: Page) => page.evaluate(() => window.galeo.tabs.snapshot());
const paths = async (page: Page) => (await snapshot(page)).tabs.map((tab) => tab.path);
const panel = (window: Page) => window.getByTestId('side-panel');
const rows = (window: Page) => panel(window).getByRole('tab');
const names = async (window: Page) => panel(window).locator('.tab-label').allTextContents();
const profileFile = (home: string, profile = 'default') => path.join(appDirs(home).config, 'profiles', profile, 'profile.json');
const kept = (home: string) => (JSON.parse(readFileSync(profileFile(home), 'utf8')) as { settings?: Record<string, unknown> }).settings ?? {};

/** A temp home whose default profile puts its tabs on the left; `work`, when asked for, keeps them on top. */
function leftHome({ theme = 'light', work = false }: { theme?: 'light' | 'dark'; work?: boolean } = {}) {
  const home = tempHome();
  const write = (file: string, content: string) => {
    const target = path.join(appDirs(home).config, file);
    mkdirSync(path.dirname(target), { recursive: true });
    saveFile(target, content);
  };
  write('settings.json', `{"schemaVersion":1,"themeMode":"${theme}"}`);
  write('profiles/default/profile.json', '{"schemaVersion":1,"name":"default","settings":{"tabsPosition":"left"}}');
  if (work) write('profiles/work/profile.json', '{"schemaVersion":1,"name":"work","settings":{"tabsPosition":"top"}}');
  return home;
}

async function secondWindow(app: ElectronApplication, home: string, args: string[]) {
  const opened = app.waitForEvent('window');
  expect(launchSecond(home, args).status).toBe(0);
  return opened;
}

/** Drags the divider with the mouse from where it is to `x`, and lets go. */
async function dragDivider(window: Page, x: number) {
  const box = (await window.getByTestId('panel-divider').boundingBox())!;
  await window.mouse.move(box.x + box.width / 2, box.y + 200);
  await window.mouse.down();
  await window.mouse.move(x, box.y + 200, { steps: 6 });
  await window.mouse.up();
}

for (const theme of ['light', 'dark'] as const) {
  test(`a profile's tabs show as rows with their folder under a title bar that names the shown one and drags the window; both pass axe (${theme})`, async () => {
    const home = leftHome({ theme });
    const { window, close } = await launchApp(['--', basic, gfm], { home });
    try {
      await expect(shownDocument(window).locator('h1')).toBeVisible();
      await expect(window.getByTestId('tab-bar').and(window.locator(':not([data-testid="title-bar"])'))).toHaveCount(0);
      expect(await names(window)).toEqual(['basic.md', 'gfm.md']);
      await expect(rows(window).first().locator('.tab-folder')).toContainText('fixtures/docs');
      await expect(window.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical');
      const title = window.getByTestId('title-bar-text');
      await expect(title).toHaveText(/^basic\.md — .*fixtures\/docs$/);
      expect(await title.evaluate((element) => getComputedStyle(element).getPropertyValue('-webkit-app-region'))).toBe('drag');
      expect(await window.getByTestId('window-grip').evaluate((element) => getComputedStyle(element).getPropertyValue('-webkit-app-region'))).toBe('drag');
      expect((await panel(window).boundingBox())!.width).toBe(220);
      const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[data-testid="title-bar"]').include('[data-testid="side-panel"]').analyze();
      expect(results.violations).toEqual([]);
    } finally {
      await close();
      removeTempHome(home);
    }
  });
}

test('↑/↓ and Enter show a tab from the list, and Ctrl+Shift+PgDn moves it down', async () => {
  const home = leftHome();
  const { window, close } = await launchApp(['--', basic, gfm, math], { home });
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    await rows(window).first().click();
    await window.keyboard.press('ArrowDown');
    await window.keyboard.press('Enter');
    await expect.poll(async () => (await snapshot(window)).active).toBe((await snapshot(window)).tabs[1]!.id);
    await window.keyboard.press('ControlOrMeta+Shift+PageDown');
    await expect.poll(() => paths(window)).toEqual([basic, math, gfm]);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('a row dragged down the list moves there', async () => {
  const home = leftHome();
  const { window, close } = await launchApp(['--', basic, gfm, math], { home });
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    const last = (await rows(window).last().boundingBox())!;
    await rows(window).first().dragTo(rows(window).last(), { targetPosition: { x: last.width / 2, y: last.height * 0.75 } });
    await expect.poll(() => paths(window)).toEqual([gfm, math, basic]);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('files dropped between two rows open there, and below the last row at the end', async () => {
  const home = leftHome();
  const dir = path.join(home, 'drop');
  mkdirSync(dir, { recursive: true });
  const [first, second] = ['first.md', 'second.md'].map((name) => path.join(dir, name)) as [string, string];
  writeFileSync(first, '# First\n');
  writeFileSync(second, '# Second\n');
  const { window, close } = await launchApp(['--', basic, gfm], { home });
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    const top = (await rows(window).first().boundingBox())!;
    await dropFiles(window, [first], { x: top.x + top.width / 2, y: top.y + top.height - 3 });
    await expect.poll(() => paths(window)).toEqual([basic, first, gfm]);
    const box = (await panel(window).boundingBox())!;
    await dropFiles(window, [second], { x: box.x + box.width / 2, y: box.y + box.height - 20 });
    await expect.poll(() => paths(window)).toEqual([basic, first, gfm, second]);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test("a tab dragged from the side panel goes to another profile's tab bar, and one from there comes into the panel", async () => {
  const home = leftHome({ work: true });
  const { app, window, close } = await launchApp(['--', basic, gfm], { home });
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    const work = await secondWindow(app, home, ['--profile', 'work', '--', math]);
    await expect(work.getByTestId('tab-bar')).toBeVisible();
    await expect(work.getByRole('tab')).toHaveCount(1);

    const out = await startDragging(window, basic);
    await expect(work.getByTestId('tab-bar')).toHaveAttribute('data-tab-drag', 'true');
    await expect(window.getByTestId('title-bar')).toHaveAttribute('data-tab-drag', 'true');
    const strip = (await work.locator('.tab-strip').boundingBox())!;
    await dropTab(work, out, { x: strip.x + strip.width - 10, y: strip.y + strip.height / 2 });
    await window.mouse.up();
    await expect.poll(() => paths(work)).toEqual([math, basic]);
    await expect.poll(() => paths(window)).toEqual([gfm]);

    const back = await startDragging(work, math);
    const into = (await rows(window).first().boundingBox())!;
    await dropTab(window, back, { x: into.x + into.width / 2, y: into.y + 4 });
    await work.mouse.up();
    await expect.poll(() => paths(window)).toEqual([math, gfm]);
    await expect.poll(() => paths(work)).toEqual([basic]);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('a row dragged out of every window gets a window of its own; out over the title bar and back in, it stays', async () => {
  const home = leftHome();
  const { app, window, close } = await launchApp(['--', basic, gfm, math], { home });
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    await startDragging(window, math);
    await crossEdge(window, 'dragleave', '[data-testid="title-bar"]');
    await crossEdge(window, 'dragenter', '[data-testid="side-panel"] .tab-strip');
    await endDrag(window, 'math.md', 'none');
    await window.mouse.up();
    await window.waitForTimeout(1000);
    expect(app.windows()).toHaveLength(1);

    await startDragging(window, basic);
    const opened = app.waitForEvent('window');
    await endDragOutside(window, 'basic.md', 'none');
    const torn = await opened;
    await window.mouse.up();
    await expect.poll(() => paths(torn)).toEqual([basic]);
    await expect.poll(() => paths(window)).toEqual([gfm, math]);
    // The new window is the same profile's: its tabs are on the left too.
    await expect(panel(torn)).toBeVisible();
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('the divider sets the width the profile keeps across a restart; a double-click resets it', async () => {
  const home = leftHome();
  let launched = await launchApp(['--', basic], { home });
  try {
    await expect(shownDocument(launched.window).locator('h1')).toBeVisible();
    await dragDivider(launched.window, 300);
    await expect.poll(() => kept(home)['tabPanelWidth']).toBe(300);
    expect((await panel(launched.window).boundingBox())!.width).toBe(300);
    await launched.app.close();

    launched = await launchApp(['--', basic], { home });
    await expect(panel(launched.window)).toBeVisible();
    expect((await panel(launched.window).boundingBox())!.width).toBe(300);
    await launched.window.getByTestId('panel-divider').dblclick();
    await expect.poll(() => kept(home)['tabPanelWidth']).toBe(220);
    await launched.window.getByTestId('panel-divider').focus();
    await launched.window.keyboard.press('ArrowRight');
    await expect.poll(() => kept(home)['tabPanelWidth']).toBe(236);
  } finally {
    await launched.close();
    removeTempHome(home);
  }
});

test('collapsed, the panel is a strip of markers that still show and take tabs; the button, Ctrl+Shift+B, Enter and a drag collapse and expand it', async () => {
  const home = leftHome();
  const { window, close } = await launchApp(['--', basic, gfm, math], { home });
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+Shift+B');
    await expect(panel(window)).toHaveAttribute('data-collapsed', 'true');
    await expect(window.getByTestId('status-message')).toHaveText('Tab panel collapsed');
    expect((await panel(window).boundingBox())!.width).toBe(32);
    await expect(panel(window).locator('.tab-marker')).toHaveText(['B', 'G', 'M']);
    const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[data-testid="side-panel"]').analyze();
    expect(results.violations).toEqual([]);

    await rows(window).nth(2).hover();
    await expect(window.getByTestId('marker-tip')).toHaveText(/^math\.md — /);
    await rows(window).nth(2).click();
    await expect.poll(async () => (await snapshot(window)).active).toBe((await snapshot(window)).tabs[2]!.id);
    await window.keyboard.press('ArrowUp');
    await expect(window.getByTestId('marker-tip')).toHaveText(/^gfm\.md — /);

    await window.getByTestId('panel-toggle').click();
    await expect(panel(window)).not.toHaveAttribute('data-collapsed');
    await window.getByTestId('panel-divider').focus();
    await window.keyboard.press('Enter');
    await expect(panel(window)).toHaveAttribute('data-collapsed', 'true');
    await dragDivider(window, 260);
    await expect(panel(window)).not.toHaveAttribute('data-collapsed');
    await expect.poll(() => kept(home)['tabPanelWidth']).toBe(260);
    await dragDivider(window, 60);
    await expect(panel(window)).toHaveAttribute('data-collapsed', 'true');
    expect(kept(home)['tabPanelWidth']).toBe(260);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('the palette puts the tabs on top and back on the left; Ctrl+Shift+B on top only says why it does nothing', async () => {
  const home = leftHome();
  const { window, close } = await launchApp(['--', basic, gfm], { home });
  const choose = async (label: string) => {
    await window.keyboard.press('ControlOrMeta+Shift+P');
    const palette = window.getByTestId('palette');
    await palette.getByRole('combobox').fill(label);
    await palette.getByRole('option', { name: label }).click();
    await expect(palette).toHaveCount(0);
  };
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    await choose('Put tabs on top');
    await expect(window.getByTestId('tab-bar')).toBeVisible();
    await expect(panel(window)).toHaveCount(0);
    expect(kept(home)['tabsPosition']).toBe('top');
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+Shift+B');
    await expect(window.getByTestId('status-message')).toHaveText('The tab panel shows only with tabs on the left');
    await choose('Put tabs on the left');
    await expect(panel(window)).toBeVisible();
    expect(kept(home)['tabsPosition']).toBe('left');
  } finally {
    await close();
    removeTempHome(home);
  }
});
