import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, launchSecond, removeTempHome, tempHome } from '../helpers/launch';

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const [basic, gfm, math, frontmatter] = ['basic.md', 'gfm.md', 'math.md', 'frontmatter.md'].map((name) => path.join(docs, name)) as [
  string,
  string,
  string,
  string,
];

const paths = async (page: Page) => (await page.evaluate(() => window.galeo.tabs.snapshot())).tabs.map((tab) => tab.path);
const titles = (app: ElectronApplication) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((window) => window.getTitle()).sort());

/**
 * Presses a key main handles through the window's own input path, as the desktop delivers it
 * (Playwright's presses skip main's input hook). CmdOrCtrl, plus Shift when asked.
 */
async function pressInMain(app: ElectronApplication, page: Page, keyCode: string, shift = false) {
  const window = await app.browserWindow(page);
  await window.evaluate((browserWindow, { keyCode, shift }) => {
    const modifiers: ('control' | 'meta' | 'shift')[] = [process.platform === 'darwin' ? 'meta' : 'control'];
    if (shift) modifiers.push('shift');
    browserWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    browserWindow.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  }, { keyCode, shift });
}

test('the window title names the shown file and the profile', async () => {
  const { app, window, close } = await launchApp(['--', basic, gfm]);
  try {
    await expect.poll(() => titles(app)).toEqual(['basic.md — default — galeo']);
    await expect(window.getByRole('tab')).toHaveCount(2);
    await window.keyboard.press('Control+Tab');
    await expect.poll(() => titles(app)).toEqual(['gfm.md — default — galeo']);
  } finally {
    await close();
  }
});

test('Ctrl+N opens an empty window of the same profile; Ctrl+Shift+W closes a window', async () => {
  const { app, window, close } = await launchApp(['--', basic]);
  try {
    await expect(window.getByTestId('app-root')).toHaveAttribute('data-worker', 'ready');
    const opened = app.waitForEvent('window');
    await pressInMain(app, window, 'N');
    const second = await opened;
    await expect(second.getByTestId('empty-window')).toBeVisible();
    await expect.poll(() => titles(app)).toEqual(['basic.md — default — galeo', 'default — galeo']);
    const gone = second.waitForEvent('close');
    await pressInMain(app, second, 'W', true);
    await gone;
    expect(app.windows()).toHaveLength(1);
  } finally {
    await close();
  }
});

test('a closed window of several comes back with its tabs on Ctrl+Shift+T', async () => {
  const home = tempHome();
  const { app, window, close } = await launchApp(['--', basic], { home });
  try {
    await expect.poll(() => paths(window)).toEqual([basic]);
    const opened = app.waitForEvent('window');
    expect(launchSecond(home, ['--new-window', '--', gfm, math]).status).toBe(0);
    const second = await opened;
    await expect.poll(() => paths(second)).toEqual([gfm, math]);
    const gone = second.waitForEvent('close');
    await pressInMain(app, second, 'W', true);
    await gone;

    const reopened = app.waitForEvent('window');
    await window.keyboard.press('ControlOrMeta+Shift+T');
    const back = await reopened;
    await expect.poll(() => paths(back)).toEqual([gfm, math]);
    // The first window kept its own tabs.
    expect(await paths(window)).toEqual([basic]);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('Ctrl+Shift+Q quits, saving every running profile; each comes back with all its windows', async () => {
  const home = tempHome();
  const first = await launchApp(['--', basic], { home });
  let quit = false;
  try {
    const { app, window } = first;
    await expect.poll(() => paths(window)).toEqual([basic]);
    for (const args of [['--new-window', '--', gfm], ['--profile', 'work', '--', math], ['--profile', 'work', '--new-window', '--', frontmatter]]) {
      const opened = app.waitForEvent('window');
      expect(launchSecond(home, args).status).toBe(0);
      await opened;
    }
    await expect.poll(async () => (await Promise.all(app.windows().map(paths))).flat().sort()).toEqual([basic, frontmatter, gfm, math].sort());
    const exited = app.waitForEvent('close');
    await pressInMain(app, window, 'Q', true);
    await exited;
    quit = true;
  } finally {
    if (!quit) await first.app.close();
  }

  // The launch restores the profile last worked in (work, whose window opened last); the other
  // comes back when asked for.
  const again = await launchApp([], { home });
  try {
    const { app } = again;
    await expect.poll(async () => app.windows().length).toBe(2);
    await expect.poll(async () => (await Promise.all(app.windows().map(paths))).map((list) => list.join()).sort()).toEqual([frontmatter, math].sort());
    expect(launchSecond(home, ['--profile', 'default']).status).toBe(0);
    await expect.poll(async () => app.windows().length).toBe(4);
    await expect.poll(async () => (await Promise.all(app.windows().map(paths))).map((list) => list.join()).sort()).toEqual([basic, frontmatter, gfm, math].sort());
  } finally {
    await again.close();
    removeTempHome(home);
  }
});
