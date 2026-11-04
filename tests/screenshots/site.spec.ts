// The website's screenshots (site/screenshots/), taken from the built app with the documents in
// showcase/. Not part of CI: run `npm run build`, then `npm run headless -- npm run site:screenshots`.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { appDirs, launchApp, removeTempHome, tempHome } from '../helpers/launch';
import { saveFile } from '../helpers/save';

const SHOWCASE = path.resolve(import.meta.dirname, 'showcase');
const OUT = path.resolve(import.meta.dirname, '../../site/screenshots');
/** Where the documents are opened from, so the status bar shows a neutral path. */
const PROJECT = '/tmp/search-service';
const WIDTH = 1280;
const HEIGHT = 800;

const shown = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const file = (name: string) => path.join(PROJECT, name);

test.beforeAll(() => {
  rmSync(PROJECT, { recursive: true, force: true });
  cpSync(SHOWCASE, PROJECT, { recursive: true });
  mkdirSync(OUT, { recursive: true });
});
test.afterAll(() => rmSync(PROJECT, { recursive: true, force: true }));

/** A temp home with the theme and tab position set. */
function home(theme: 'light' | 'dark', tabsPosition: 'top' | 'left' = 'top'): string {
  const dir = tempHome();
  const write = (name: string, content: string) => {
    const target = path.join(appDirs(dir).config, name);
    mkdirSync(path.dirname(target), { recursive: true });
    saveFile(target, content);
  };
  write('settings.json', `{"schemaVersion":1,"themeMode":"${theme}"}`);
  write('profiles/default/profile.json', `{"schemaVersion":1,"name":"default","settings":{"tabsPosition":"${tabsPosition}"}}`);
  return dir;
}

/** Opens `files` in a window of the shot's size, runs `arrange`, and saves the window as `name`.png. */
async function shoot(
  name: string,
  files: string[],
  arrange: (window: Page, app: ElectronApplication) => Promise<void>,
  options: { theme?: 'light' | 'dark'; tabsPosition?: 'top' | 'left' } = {},
) {
  const dir = home(options.theme ?? 'light', options.tabsPosition);
  const { app, window, close } = await launchApp(['--', ...files.map(file)], { home: dir });
  try {
    const browserWindow = await app.browserWindow(window);
    await browserWindow.evaluate((w, [width, height]) => w.setContentSize(width, height), [WIDTH, HEIGHT]);
    // A 2× display, for sharp images: galeo refuses Chromium switches on its command line (SR-13).
    const cdp = await window.context().newCDPSession(window);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: false });
    await expect(window.getByRole('tab')).toHaveCount(files.length);
    await arrange(window, app);
    // Lets fonts, diagrams and transitions settle.
    await window.evaluate(() => document.fonts.ready);
    await window.waitForTimeout(800);
    await window.mouse.move(WIDTH - 2, HEIGHT - 2);
    // Through CDP, which captures at the emulated scale (Playwright's own capture stays at 1×).
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  } finally {
    await close();
    removeTempHome(dir);
  }
}

const ALL = ['plan.md', 'results.json', 'requests.csv', 'search.log', 'config.yaml'];

async function showTab(window: Page, label: string) {
  await window.getByRole('tab', { name: new RegExp(label.replace('.', '\\.')) }).click();
  await expect(shown(window)).toBeVisible();
}

async function palette(window: Page, command: string) {
  await window.keyboard.press('ControlOrMeta+Shift+P');
  await window.getByTestId('palette').getByRole('combobox').fill(command);
  await window.keyboard.press('Enter');
}

for (const theme of ['light', 'dark'] as const) {
  test(`markdown, ${theme}`, async () => {
    await shoot(`markdown-${theme}`, ALL, async (window) => {
      await showTab(window, 'plan.md');
      // Light shows the top of the plan; dark its math, code and diagram.
      if (theme === 'dark') {
        await shown(window).getByRole('heading', { name: 'Ranking' }).evaluate((heading) => heading.scrollIntoView({ block: 'start' }));
        await expect(shown(window).locator('.galeo-diagram svg').first()).toBeVisible();
      }
    }, { theme });
  });
}

test('edit with the split preview', async () => {
  await shoot('split-edit', ALL, async (window, app) => {
    await showTab(window, 'plan.md');
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Editing');
    await window.keyboard.press('ControlOrMeta+Backslash');
    await expect(shown(window).getByRole('separator', { name: 'Resize source and preview' })).toBeVisible();
  });
});

test('JSON tree', async () => {
  await shoot('json-tree', ALL, async (window) => {
    await showTab(window, 'results.json');
    await palette(window, 'Expand all nodes');
    // Focus on a node rather than round the whole tree.
    await shown(window).locator('.galeo-json-row', { hasText: 'stages' }).first().click();
  });
});

test('CSV table', async () => {
  await shoot('csv-table', ALL, async (window) => {
    await showTab(window, 'requests.csv');
    await expect(shown(window).getByRole('grid')).toBeVisible();
  });
});

test('log', async () => {
  await shoot('log', ALL, async (window) => {
    await showTab(window, 'search.log');
  }, { theme: 'dark' });
});

test('tabs on the left with the palette', async () => {
  await shoot('tabs-left-palette', ALL, async (window) => {
    await showTab(window, 'plan.md');
    await window.mouse.move(WIDTH - 2, HEIGHT - 2);
    await window.keyboard.press('ControlOrMeta+Shift+P');
    await expect(window.getByTestId('palette')).toBeVisible();
    // The row under the pointer is highlighted: go back to the first.
    await window.keyboard.press('Home');
  }, { theme: 'dark', tabsPosition: 'left' });
});

test('find in all tabs', async () => {
  await shoot('find-all', ALL, async (window) => {
    await window.mouse.move(WIDTH - 2, HEIGHT - 2);
    await window.keyboard.press('ControlOrMeta+Shift+F');
    await window.getByTestId('find-all').getByRole('combobox').fill('p95');
    await expect(window.getByTestId('find-all').getByRole('group').first()).toBeVisible();
  });
});
