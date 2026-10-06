import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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
 * Opens `file` from a second launch (a new tab is always inserted, never shown warm) and crashes
 * the renderer as it starts inserting it (a test hook in main). From then on everything goes
 * through main: Playwright follows a page whose renderer dies badly.
 */
async function crashOn({ app, home }: { app: ElectronApplication; home: string }, file: string) {
  await app.evaluate((_, path) => ((globalThis as { __galeoCrashOnRendering?: string }).__galeoCrashOnRendering = path), file);
  // Listening before the second launch, which blocks this process until it has handed over.
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]!.webContents;
    (globalThis as { __galeoGone?: Promise<string> }).__galeoGone = new Promise((resolve) =>
      contents.once('render-process-gone', (_event, details) => resolve(details.reason)),
    );
  });
  const second = launchSecond(home, ['--', file]);
  const gone = await app.evaluate(
    (_, ms) => Promise.race([(globalThis as { __galeoGone?: Promise<string> }).__galeoGone!, new Promise<string>((resolve) => setTimeout(() => resolve('no crash'), ms))]),
    20_000,
  );
  if (gone === 'no crash') {
    // What to look at when a runner never crashes: did the second launch hand over, and what did
    // the window show and start to render?
    const seen = await app.evaluate(() => (globalThis as { __galeoRenderingSeen?: string[] }).__galeoRenderingSeen ?? []);
    // The page may be hung rather than gone: give it 3 s to answer.
    const tabs = await Promise.race([
      inPage<string>(app, `[...document.querySelectorAll('[role=tab]')].map((tab) => tab.textContent + ' ' + tab.getAttribute('aria-selected')).join(' | ')`).catch(String),
      new Promise<string>((resolve) => setTimeout(() => resolve('(page not answering)'), 3000)),
    ]);
    throw new Error(`no crash: second launch ${second.status}/${second.signal} ${String(second.stderr).slice(-500)}; tabs ${tabs}; rendering seen ${JSON.stringify(seen)}`);
  }
  // `crashed` on Linux and Windows, `killed` on macOS: main recovers from anything but a clean exit.
  expect(gone).not.toBe('clean-exit');
  await app.evaluate(() => delete (globalThis as { __galeoCrashOnRendering?: string }).__galeoCrashOnRendering);
}

/** The window's page, loaded again after a crash: a new renderer process, slow on a busy machine. */
const pageShows = (app: ElectronApplication, script: string, expected: unknown) =>
  expect.poll(() => inPage(app, script).catch(() => null), { timeout: 20_000 }).toEqual(expected);

/** Opens basic.md, then crashes the window as it renders gfm.md. */
async function crashOnGfm() {
  const launched = await launchApp(['--', fixture('basic.md')]);
  await expect(launched.window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"] article h1')).toBeVisible();
  await crashOn(launched, fixture('gfm.md'));
  await pageShows(launched.app, `${PANEL}?.querySelector('[data-state="crashed"]') ? 'crashed' : null`, 'crashed');
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

test('a window that crashes 3 times within a minute says so instead of reloading again: Try again, or Close window', async () => {
  test.setTimeout(120_000);
  const launched = await crashOnGfm();
  const { app, close } = launched;
  const loopTitle = `document.querySelector('[data-testid="crash-loop"] h1')?.textContent ?? null`;
  try {
    await crashOn(launched, fixture('math.md'));
    await pageShows(app, `${PANEL}?.querySelector('[data-state="crashed"]') ? 'crashed' : null`, 'crashed');
    await crashOn(launched, fixture('frontmatter.md'));
    // The third crash: the window comes back with the message, not its tabs.
    await pageShows(app, loopTitle, "This window's viewer kept crashing");
    expect(await inPage(app, `document.querySelectorAll('[role=tab]').length`)).toBe(0);
    expect(await inPage(app, `document.activeElement.textContent`)).toBe('Try again');
    // axe, run in the page through main as everything else here.
    const axe = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
    const axed = await inPage<{ violations: string[]; passes: number }>(
      app,
      `${axe};axe.run(document).then((result) => ({ violations: result.violations.map((each) => each.id), passes: result.passes.length }))`,
    );
    expect(axed.violations).toEqual([]);
    expect(axed.passes).toBeGreaterThan(5);

    await inPage(app, `[...document.querySelectorAll('button')].find((button) => button.textContent === 'Try again').click()`);
    // Its four tabs are back, the last one it was rendering marked crashed and not rendered.
    await pageShows(app, `document.querySelectorAll('[role=tab]').length`, 4);
    expect(await inPage(app, `${tabText('frontmatter.md')}.textContent`)).toContain('⚠');
    await pageShows(app, `${PANEL}?.querySelector('[data-state="crashed"]') ? 'crashed' : null`, 'crashed');
  } finally {
    await close();
  }
});

test('Close window on the crash-loop message closes the window', async () => {
  test.setTimeout(120_000);
  const launched = await crashOnGfm();
  const { app, close } = launched;
  try {
    await crashOn(launched, fixture('math.md'));
    await pageShows(app, `${PANEL}?.querySelector('[data-state="crashed"]') ? 'crashed' : null`, 'crashed');
    await crashOn(launched, fixture('frontmatter.md'));
    await pageShows(app, `document.querySelector('[data-testid="crash-loop"]') ? 'loop' : null`, 'loop');
    const closed = app.evaluate(({ BrowserWindow }) => new Promise<void>((resolve) => BrowserWindow.getAllWindows()[0]!.once('closed', () => resolve())));
    await inPage(app, `[...document.querySelectorAll('button')].find((button) => button.textContent === 'Close window').click()`).catch(() => {});
    await closed;
  } finally {
    await close();
  }
});
