// Shared by the screenshot specs: the showcase documents, a temp home with the theme and tab
// position set, and `shoot()`, which saves the window at 1280×800 on a 2× display.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { appDirs, launchApp, removeTempHome, tempHome } from '../helpers/launch';
import { saveFile } from '../helpers/save';

const SHOWCASE = path.resolve(import.meta.dirname, 'showcase');
/** Where the documents are opened from, so the status bar shows a neutral path. */
const PROJECT = '/tmp/search-service';
export const WIDTH = 1280;
export const HEIGHT = 800;

export const ALL = ['plan.md', 'results.json', 'requests.csv', 'search.log', 'config.yaml'];

export const shown = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
export const file = (name: string) => path.join(PROJECT, name);

/** Copies the showcase to its neutral path before each test (a shot may change a file), and makes `out`. */
export function useShowcase(out: string): void {
  test.beforeAll(() => mkdirSync(out, { recursive: true }));
  test.beforeEach(() => {
    rmSync(PROJECT, { recursive: true, force: true });
    cpSync(SHOWCASE, PROJECT, { recursive: true });
  });
  test.afterAll(() => rmSync(PROJECT, { recursive: true, force: true }));
}

export type ShotOptions = {
  theme?: 'light' | 'dark';
  tabsPosition?: 'top' | 'left';
  /** Runs galeo once in the same home before the shot (a session to restore, for example). */
  before?: (home: string) => Promise<void>;
  /** Leaves the pointer where `arrange` put it (a hover state) instead of moving it to the corner. */
  keepPointer?: boolean;
};

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

/** Opens `files` in a window of the shot's size, runs `arrange`, and saves the window as `out/name.png`. */
export async function shoot(
  out: string,
  name: string,
  files: string[],
  arrange: (window: Page, app: ElectronApplication) => Promise<void>,
  options: ShotOptions = {},
) {
  const dir = home(options.theme ?? 'light', options.tabsPosition);
  try {
    await options.before?.(dir);
    const { app, window, close } = await launchApp(files.length ? ['--', ...files.map(file)] : [], { home: dir });
    try {
      const browserWindow = await app.browserWindow(window);
      await browserWindow.evaluate((w, [width, height]) => w.setContentSize(width, height), [WIDTH, HEIGHT]);
      // A 2× display, for sharp images: galeo refuses Chromium switches on its command line (SR-13).
      const cdp = await window.context().newCDPSession(window);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: false });
      if (files.length) await expect(window.getByRole('tab')).toHaveCount(files.length);
      await arrange(window, app);
      // Lets fonts, diagrams and transitions settle.
      await window.evaluate(() => document.fonts.ready);
      await window.waitForTimeout(800);
      if (!options.keepPointer) await window.mouse.move(WIDTH - 2, HEIGHT - 2);
      // Through CDP, which captures at the emulated scale (Playwright's own capture stays at 1×).
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path.join(out, `${name}.png`), Buffer.from(data, 'base64'));
    } finally {
      await close();
    }
  } finally {
    removeTempHome(dir);
  }
}

export async function showTab(window: Page, label: string) {
  await window.getByRole('tab', { name: new RegExp(label.replace('.', '\\.')) }).click();
  await expect(shown(window)).toBeVisible();
}

export async function palette(window: Page, command: string) {
  await window.keyboard.press('ControlOrMeta+Shift+P');
  await window.getByTestId('palette').getByRole('combobox').fill(command);
  await window.keyboard.press('Enter');
}
