import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { launchApp } from '../helpers/launch';

const basic = path.resolve(import.meta.dirname, '../fixtures/docs/basic.md');
const mac = process.platform === 'darwin';
const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const palette = (window: Page) => window.getByTestId('palette');
const capabilityKeys = (app: ElectronApplication) => app.evaluate(() => (globalThis as { __galeoCapabilityKeys?: string[] }).__galeoCapabilityKeys ?? []);

/** Every row of the UX keyboard map, as the palette names it, with its keys off macOS and on it. */
const KEYBOARD_MAP: [label: string, keys: string[], macKeys: string[]][] = [
  ['Quick open', ['Ctrl+P'], ['⌘P']],
  ['Command palette', ['Ctrl+Shift+P'], ['⇧⌘P']],
  ['Find', ['Ctrl+F'], ['⌘F']],
  ['Find next', ['F3'], ['F3']],
  ['Find previous', ['Shift+F3'], ['⇧F3']],
  ['Toggle source view', ['Ctrl+U'], ['⌘U']],
  ['Toggle wrap', ['Alt+Z'], ['⌥Z']],
  ['Toggle outline', ['Ctrl+Shift+O'], ['⇧⌘O']],
  ['Follow end (logs)', ['End'], ['End']],
  ['Reload from disk', ['F5', 'Ctrl+R'], ['F5', '⌘R']],
  ['Back', ['Alt+←'], ['⌥←']],
  ['Forward', ['Alt+→'], ['⌥→']],
  ['New window', ['Ctrl+N'], ['⌘N']],
  ['Close tab', ['Ctrl+W'], ['⌘W']],
  ['Close window', ['Ctrl+Shift+W'], ['⇧⌘W']],
  ['Reopen closed tab or window', ['Ctrl+Shift+T'], ['⇧⌘T']],
  ['Next tab', ['Ctrl+Tab', 'Ctrl+PgDn'], ['⌃Tab', '⌘PgDn']],
  ['Previous tab', ['Ctrl+Shift+Tab', 'Ctrl+PgUp'], ['⌃⇧Tab', '⌘PgUp']],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n): [string, string[], string[]] => [`Go to tab ${n}`, [`Ctrl+${n}`], [`⌘${n}`]]),
  ['Go to last tab', ['Ctrl+9'], ['⌘9']],
  ['Move tab left', ['Ctrl+Shift+PgUp'], ['⇧⌘PgUp']],
  ['Move tab right', ['Ctrl+Shift+PgDn'], ['⇧⌘PgDn']],
  ['Profile menu', ['Ctrl+Shift+M'], ['⇧⌘M']],
  ['Settings', ['Ctrl+,'], ['⌘,']],
  ['Zoom in', ['Ctrl+='], ['⌘=']],
  ['Zoom out', ['Ctrl+-'], ['⌘-']],
  ['Reset zoom', ['Ctrl+0'], ['⌘0']],
  ['Full screen', ['F11'], ['F11']],
  ['Quit', ['Ctrl+Shift+Q'], ['⌘Q']],
  ['Toggle edit mode', ['Ctrl+E'], ['⌘E']],
];

async function openPalette(window: Page) {
  await window.keyboard.press('ControlOrMeta+Shift+P');
  await expect(palette(window).getByRole('combobox')).toBeFocused();
}

async function run(window: Page, query: string) {
  await openPalette(window);
  await palette(window).getByRole('combobox').fill(query);
  await window.keyboard.press('Enter');
  await expect(palette(window)).toHaveCount(0);
}

test('Ctrl+Shift+P lists every shortcut of the keyboard map with its keys, and passes axe', async () => {
  const { window, close } = await launchApp(['--', basic]);
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    await openPalette(window);
    const listed = await palette(window)
      .getByRole('option')
      .evaluateAll((options) =>
        Object.fromEntries(options.map((option) => [option.querySelector('.palette-label')?.textContent, [...option.querySelectorAll('kbd')].map((key) => key.textContent)])),
      );
    expect(listed).toMatchObject(Object.fromEntries(KEYBOARD_MAP.map(([label, keys, macKeys]) => [label, mac ? macKeys : keys])));
    const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[data-testid="palette"]').analyze();
    expect(results.violations).toEqual([]);
    await window.keyboard.press('Escape');
    await expect(palette(window)).toHaveCount(0);
    await expect(shownDocument(window)).toBeFocused();
  } finally {
    await close();
  }
});

test('the palette runs a page command in the shown document', async () => {
  const { window, close } = await launchApp(['--', basic]);
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    await run(window, 'source view');
    await expect(shownDocument(window).locator('.cm-editor')).toBeVisible();
  } finally {
    await close();
  }
});

test('the palette asks main for a window command: New window', async () => {
  const { app, window, close } = await launchApp(['--', basic]);
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    const opened = app.waitForEvent('window');
    await run(window, 'new window');
    await expect((await opened).getByTestId('empty-window')).toBeVisible();
  } finally {
    await close();
  }
});

test('a capability entry names its key and grants nothing; the key itself still reaches main only', async () => {
  const { app, window, close } = await launchApp(['--', basic]);
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    await run(window, 'edit mode');
    await expect(window.getByTestId('status-message')).toHaveText(mac ? 'Press ⌘E' : 'Press Ctrl+E');
    expect(await capabilityKeys(app)).toEqual([]);
    await pressInMain(app, window, 'E');
    await expect.poll(() => capabilityKeys(app)).toEqual(['editMode']);
  } finally {
    await close();
  }
});

test('About galeo shows its version and every notice it ships, and passes axe', async () => {
  const { window, close } = await launchApp(['--', basic]);
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    await run(window, 'about');
    const about = window.getByTestId('about');
    await expect(about.getByRole('heading', { level: 2 })).toHaveText(/^galeo \d+\.\d+\.\d+/);
    const notices = about.getByTestId('about-notices');
    await expect(notices.locator('summary', { hasText: 'react-aria-components' })).toHaveCount(1);
    await expect(notices.locator('summary', { hasText: 'dompurify' })).toContainText('Apache-2.0');
    await expect(notices.locator('summary', { hasText: '(font)' })).toHaveCount(3);
    await expect(notices.locator('summary').first()).toHaveText('Electron · MIT');
    const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[data-testid="about"]').analyze();
    expect(results.violations).toEqual([]);
    await window.keyboard.press('Escape');
    await expect(about).toHaveCount(0);
    await expect(shownDocument(window)).toBeFocused();
  } finally {
    await close();
  }
});
