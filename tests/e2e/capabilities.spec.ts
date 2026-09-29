import { chmodSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, tempHome } from '../helpers/launch';

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const opened = (app: ElectronApplication) => app.evaluate(() => (globalThis as { __galeoOpenedPaths?: string[] }).__galeoOpenedPaths ?? []);
const menus = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as { __galeoMenus?: { id: string; enabled?: boolean }[][] }).__galeoMenus ?? []);
const env = { GALEO_TEST_EXTERNAL: 'record', GALEO_TEST_MENU_CHOICE: 'open-default' };

test('main takes Ctrl+E before the page sees it', async () => {
  const { app, window, close } = await launchApp(['--', path.join(docs, 'basic.md')]);
  try {
    await expect(shownDocument(window)).toBeVisible();
    await window.evaluate(() => {
      const page = globalThis as unknown as Window & { __keys?: string[] };
      page.__keys = [];
      page.addEventListener('keydown', (event) => page.__keys!.push(event.key.toLowerCase()), true);
    });
    // Through the window's input path, as the desktop delivers keys (Playwright's own presses skip
    // main's input hook). Ctrl+F, pressed the same way, still reaches the page.
    await app.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0]!.webContents;
      for (const keyCode of ['E', 'F']) {
        contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] });
        contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] });
      }
    });
    await expect(window.getByRole('search')).toBeVisible();
    expect(await window.evaluate(() => (globalThis as { __keys?: string[] }).__keys)).not.toContain('e');
    expect(await app.evaluate(() => (globalThis as { __galeoCapabilityKeys?: string[] }).__galeoCapabilityKeys)).toEqual(['editMode']);
  } finally {
    await close();
  }
});

test("a right-click shows main's menu, whose Open with default app opens a plain document", async () => {
  const file = path.join(docs, 'basic.md');
  const { app, window, close } = await launchApp(['--', file], { env });
  try {
    await shownDocument(window).locator('h1').click({ button: 'right' });
    await expect.poll(() => opened(app)).toEqual([file]);
    expect((await menus(app))[0]!.map((item) => item.id)).toEqual(['open-default', 'reveal', 'copy-path']);
  } finally {
    await close();
  }
});

test('an executable is never opened with the default app, and the page has no way to ask', async () => {
  // The execute bit is POSIX; on Windows the extension decides, which the unit tests cover.
  test.skip(process.platform === 'win32', 'POSIX execute bit');
  const dir = tempHome();
  const tool = path.join(dir, 'tool.txt');
  writeFileSync(tool, 'not really text\n');
  chmodSync(tool, 0o755);
  const { app, window, close } = await launchApp(['--', tool], { env });
  try {
    await expect(shownDocument(window)).toBeVisible();
    await shownDocument(window).click({ button: 'right' });
    await expect.poll(async () => (await menus(app)).length).toBe(1);
    expect((await menus(app))[0]![0]).toMatchObject({ id: 'open-default', enabled: false });
    // No channel opens a file: the bridge has none, and the page can't reach IPC itself.
    const reachable = await window.evaluate(() => {
      const page = globalThis as unknown as Window & { ipcRenderer?: unknown; require?: unknown };
      return {
        method: 'openWithDefaultApp' in page.galeo.documents || 'openPath' in page.galeo.documents,
        ipc: typeof page.ipcRenderer,
        require: typeof page.require,
      };
    });
    expect(reachable).toEqual({ method: false, ipc: 'undefined', require: 'undefined' });
    expect(await opened(app)).toEqual([]);
  } finally {
    await close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a file that can't be shown offers to close the tab or main's file menu", async () => {
  const { app, window, close } = await launchApp(['--', path.join(docs, 'binary.bin'), path.join(docs, 'basic.md')], { env: { GALEO_TEST_MENU_CHOICE: 'none' } });
  try {
    const state = window.getByTestId('document-state');
    await expect(state).toContainText('This looks like a binary file');
    await state.getByRole('button', { name: 'File actions…' }).click();
    await expect.poll(async () => (await menus(app)).length).toBe(1);
    await state.getByRole('button', { name: 'Close tab' }).click();
    await expect(window.getByRole('tab')).toHaveCount(1);
  } finally {
    await close();
  }
});
