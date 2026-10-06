import path from 'node:path';
import { expect, test, type ElectronApplication } from '@playwright/test';
import { launchApp, launchSecond } from '../helpers/launch';

const fixture = (name: string) => path.resolve(import.meta.dirname, '../fixtures/docs', name);

/**
 * Runs `script` in the window's page through main. Playwright keeps no handle on a page whose
 * renderer crashed, even once the window has loaded it again.
 */
function inPage<T>(app: ElectronApplication, script: string): Promise<T> {
  return app.evaluate(({ BrowserWindow }, source) => BrowserWindow.getAllWindows()[0]!.webContents.executeJavaScript(source), script);
}

const PANEL = `document.querySelector('[data-testid="tab-panel"][data-active="true"]')`;
const tabText = (name: string) => `[...document.querySelectorAll('[role=tab]')].find((tab) => tab.textContent.includes('${name}'))`;

/**
 * Opens basic.md, then gfm.md from a second launch (a new tab is always inserted, never shown warm),
 * and crashes the renderer as it starts inserting gfm.md (a test hook in main). From then on
 * everything goes through main: Playwright follows a page whose renderer dies badly.
 */
async function crashOnGfm() {
  const launched = await launchApp(['--', fixture('basic.md')]);
  const { app, window, home } = launched;
  await expect(window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"] article h1')).toBeVisible();
  await app.evaluate((_, file) => ((globalThis as { __galeoCrashOnRendering?: string }).__galeoCrashOnRendering = file), fixture('gfm.md'));
  // Listening before the second launch, which blocks this process until it has handed over.
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]!.webContents;
    (globalThis as { __galeoGone?: Promise<string> }).__galeoGone = new Promise((resolve) =>
      contents.once('render-process-gone', (_event, details) => resolve(details.reason)),
    );
  });
  launchSecond(home, ['--', fixture('gfm.md')]);
  const gone = app.evaluate(() => (globalThis as { __galeoGone?: Promise<string> }).__galeoGone!);
  // `crashed` on Linux and Windows, `killed` on macOS: main recovers from anything but a clean exit.
  expect(await gone).not.toBe('clean-exit');
  await app.evaluate(() => delete (globalThis as { __galeoCrashOnRendering?: string }).__galeoCrashOnRendering);
  // The same window loads its page again: a new renderer process, slow on a busy machine.
  await expect
    .poll(() => inPage(app, `${PANEL}?.querySelector('[data-state="crashed"]') ? 'crashed' : null`), { timeout: 20_000 })
    .toBe('crashed');
  return launched;
}

test('a window whose renderer crashes comes back with its tabs, the one it was rendering marked crashed', async () => {
  test.setTimeout(60_000);
  const { app, close } = await crashOnGfm();
  try {
    expect(await inPage(app, `${PANEL}.querySelector('.document-state-title').textContent`)).toBe(
      "This document crashed the viewer and won't be rendered automatically",
    );
    expect(await inPage(app, `${tabText('gfm.md')}.textContent`)).toContain('⚠');
    expect(await inPage(app, `${tabText('gfm.md')}.getAttribute('aria-selected')`)).toBe('true');
    expect(await inPage(app, `${tabText('basic.md')}.getAttribute('data-hibernated')`)).toBe('true');
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);

    await inPage(app, `[...${PANEL}.querySelectorAll('button')].find((button) => button.textContent === 'Try again').click()`);
    await expect.poll(() => inPage(app, `!!${PANEL}.querySelector('[data-testid="document"]')?.shadowRoot?.querySelector('article table')`)).toBe(true);
    expect(await inPage(app, `${tabText('gfm.md')}.textContent`)).not.toContain('⚠');
  } finally {
    await close();
  }
});

test('a crashed tab can be opened as source instead', async () => {
  test.setTimeout(60_000);
  const { app, close } = await crashOnGfm();
  try {
    await inPage(app, `[...${PANEL}.querySelectorAll('button')].find((button) => button.textContent === 'Open as source').click()`);
    await expect.poll(() => inPage(app, `!!${PANEL}.querySelector('[data-testid="document"]')?.shadowRoot?.querySelector('.cm-editor')`)).toBe(true);
  } finally {
    await close();
  }
});
