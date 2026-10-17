import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { appDirs, launchApp, removeTempHome, tempHome } from '../helpers/launch';
import { saveFile } from '../helpers/save';

const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const grid = (window: Page) => shownDocument(window).locator('[role=grid]');
const headers = (window: Page) => grid(window).locator('[role=columnheader]');
const bodyRows = (window: Page) => grid(window).locator('.galeo-csv-row');
const banner = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document-banner"]');

/** A temp home with these files (and a theme), `files[name]` each one's path. */
function setUp(contents: Record<string, string>, theme: 'light' | 'dark' = 'light') {
  const home = tempHome();
  const settings = path.join(appDirs(home).config, 'settings.json');
  mkdirSync(path.dirname(settings), { recursive: true });
  saveFile(settings, `{"schemaVersion":1,"themeMode":"${theme}"}`);
  const folder = path.join(home, 'files');
  mkdirSync(folder);
  const files: Record<string, string> = {};
  for (const [name, text] of Object.entries(contents)) writeFileSync((files[name] = path.join(folder, name)), text);
  return { home, files };
}

const SAMPLE = 'name,qty,note\npear,3,"ripe, sweet"\nfig,12\n"multi\nline",1,x\n';

for (const theme of ['light', 'dark'] as const) {
  test(`a .csv opens as a table with its header in view, and passes axe (${theme})`, async () => {
    const { home, files } = setUp({ 'fruit.csv': SAMPLE }, theme);
    const { window, close } = await launchApp(['--', files['fruit.csv']!], { home });
    try {
      await expect(grid(window)).toHaveAttribute('aria-label', 'fruit.csv');
      await expect(headers(window)).toHaveText(['#', 'name', 'qty', 'note']);
      await expect(bodyRows(window)).toHaveCount(3);
      await expect(bodyRows(window).nth(0).locator('[role=gridcell]')).toHaveText(['pear', '3', 'ripe, sweet']);
      await expect(bodyRows(window).nth(1).locator('[role=gridcell]')).toHaveText(['fig', '12', '']);
      await expect(window.getByTestId('status-view')).toHaveText('Table');
      const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[data-testid="tab-panel"][data-active="true"]').analyze();
      expect(results.violations).toEqual([]);
    } finally {
      await close();
      removeTempHome(home);
    }
  });
}

test('arrow keys move between cells; a .csv separated by ";" and a .tsv read right', async () => {
  const { home, files } = setUp({ 'semi.csv': 'a;b\n"1,5";2\n', 'tabs.tsv': 'a\tb\nx,y\tz\n' });
  const { window, close } = await launchApp(['--', files['semi.csv']!, files['tabs.tsv']!], { home });
  try {
    await window.getByRole('tab').first().click();
    await expect(headers(window)).toHaveText(['#', 'a', 'b']);
    await bodyRows(window).first().locator('[role=gridcell]').first().click();
    await expect(bodyRows(window).first().locator('[role=gridcell]').first()).toBeFocused();
    await expect(bodyRows(window).first().locator('[role=gridcell]').first()).toHaveText('1,5');
    await window.keyboard.press('ArrowRight');
    await expect(bodyRows(window).first().locator('[role=gridcell]').nth(1)).toBeFocused();
    await window.getByRole('tab').nth(1).click();
    await expect(bodyRows(window).first().locator('[role=gridcell]')).toHaveText(['x,y', 'z']);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('Ctrl+U goes between the table and the source, keeping the place', async () => {
  const text = `n\n${Array.from({ length: 5000 }, (_, i) => `row ${i}`).join('\n')}\n`;
  const { home, files } = setUp({ 'long.csv': text });
  const { window, close } = await launchApp(['--', files['long.csv']!], { home });
  try {
    await bodyRows(window).first().locator('[role=gridcell]').click();
    await window.keyboard.press('Control+End');
    await expect(grid(window).locator('[role=gridcell]', { hasText: 'row 4999' })).toBeVisible();
    await window.keyboard.press('Control+u');
    await expect(window.getByTestId('status-view')).toHaveText('Source');
    await expect(shownDocument(window).locator('.cm-line', { hasText: /^row 4999$/ })).toBeVisible();
    await window.keyboard.press('Control+u');
    await expect(window.getByTestId('status-view')).toHaveText('Table');
    await expect(grid(window).locator('[role=gridcell]', { hasText: 'row 4999' })).toBeVisible();
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('split puts the table beside its source, and the table follows typing', async () => {
  const { home, files } = setUp({ 'edit.csv': 'a,b\n1,2\n' });
  const { app, window, close } = await launchApp(['--', files['edit.csv']!], { home });
  try {
    await expect(bodyRows(window)).toHaveCount(1);
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Editing');
    await window.keyboard.press('Control+\\');
    await expect(window.getByTestId('status-view')).toHaveText('Split');
    await expect(grid(window)).toBeVisible();
    await window.keyboard.press('Control+End');
    await window.keyboard.type('3,4\n');
    await expect(bodyRows(window)).toHaveCount(2);
    await expect(bodyRows(window).nth(1).locator('[role=gridcell]')).toHaveText(['3', '4']);
    await window.keyboard.press('Control+s');
    await expect(window.getByTestId('status-message')).toHaveText('Saved');
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('in split, scrolling the table brings the source to the same row', async () => {
  const text = `n\n${Array.from({ length: 5000 }, (_, i) => `row ${i}`).join('\n')}\n`;
  const { home, files } = setUp({ 'long.csv': text });
  const { window, close } = await launchApp(['--', files['long.csv']!], { home });
  try {
    await expect(bodyRows(window).first()).toBeVisible();
    await window.keyboard.press('Control+\\');
    await expect(window.getByTestId('status-view')).toHaveText('Split');
    await shownDocument(window).evaluate((view) => {
      const pane = view.shadowRoot!.querySelector<HTMLElement>('.galeo-rendered-pane')!;
      pane.scrollTop = 3000 * 24;
    });
    await expect(grid(window).locator('[role=gridcell]', { hasText: /^row 3000$/ })).toBeVisible();
    await expect(shownDocument(window).locator('.cm-line', { hasText: /^row 300\d$/ }).first()).toBeVisible();
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('past a million rows the table shows the first and says how many there are', async () => {
  const { home, files } = setUp({ 'many.csv': `n\n${'1\n'.repeat(1_000_001)}` });
  const { window, close } = await launchApp(['--', files['many.csv']!], { home });
  try {
    await expect(banner(window)).toHaveText('Showing 999,999 of 1,000,001 rows', { timeout: 20_000 });
    await expect(grid(window)).toHaveAttribute('aria-rowcount', '1000000');
  } finally {
    await close();
    removeTempHome(home);
  }
});

test('a CSV over 100 MB opens as source, and Show as table shows it as a table', async () => {
  const { home, files } = setUp({ 'huge.csv': `a,b\n${'xxxxxxxxxxxxxxxxxxxx,yyyyyyyyyyyyyyyyyyyy\n'.repeat(2_500_000)}` });
  const { window, close } = await launchApp(['--', files['huge.csv']!], { home });
  const heavy = { timeout: 60_000 };
  try {
    await expect(banner(window)).toHaveText(/Large file shown as source/, heavy);
    await banner(window).getByRole('button', { name: 'Show as table' }).click();
    await expect(headers(window)).toHaveText(['#', 'a', 'b'], heavy);
    await expect(window.getByTestId('status-view')).toHaveText('Table');
  } finally {
    await close();
    removeTempHome(home);
  }
});

const tableOptions = (window: Page) => window.locator('.status-table');

async function chooseTableOption(window: Page, name: string) {
  await tableOptions(window).click();
  await window.getByRole('menu', { name: 'Table options' }).getByText(name, { exact: true }).click();
}

test('the status bar sets the separator and the header, and the tab keeps them across a restart (ADR-021)', async () => {
  const { home, files } = setUp({ 'semi.csv': 'a;b;c,d\n1;2;3,4\n' });
  const first = await launchApp(['--', files['semi.csv']!], { home });
  try {
    await expect(tableOptions(first.window)).toHaveText('Auto (;) · Header');
    await expect(headers(first.window)).toHaveText(['#', 'a', 'b', 'c,d']);
    await chooseTableOption(first.window, 'Comma');
    await expect(headers(first.window)).toHaveText(['#', 'a;b;c', 'd']);
    await chooseTableOption(first.window, 'First row is a header');
    await expect(tableOptions(first.window)).toHaveText('Comma · No header');
    await expect(headers(first.window)).toHaveText(['#', '1', '2']);
    await expect(bodyRows(first.window)).toHaveCount(2);
  } finally {
    await first.close();
  }
  const again = await launchApp([], { home });
  try {
    await expect(tableOptions(again.window)).toHaveText('Comma · No header', { timeout: 15_000 });
    await chooseTableOption(again.window, 'Reset to defaults');
    await expect(tableOptions(again.window)).toHaveText('Auto (;) · Header');
  } finally {
    await again.close();
    removeTempHome(home);
  }
});

test('a .psv opens as a table, and Show as table shows other text as one (ADR-021)', async () => {
  const { home, files } = setUp({ 'export.psv': 'a|b\n1|2\n', 'notes.txt': 'x|y|z\n1|2|3\n' });
  const { window, close } = await launchApp(['--', files['export.psv']!, files['notes.txt']!], { home });
  try {
    await window.getByRole('tab').first().click();
    await expect(headers(window)).toHaveText(['#', 'a', 'b']);
    await window.getByRole('tab').nth(1).click();
    await expect(grid(window)).toHaveCount(0);
    await window.keyboard.press('ControlOrMeta+Shift+P');
    await window.getByTestId('palette').getByRole('combobox').fill('Show as table');
    await window.keyboard.press('Enter');
    await expect(headers(window)).toHaveText(['#', 'x', 'y', 'z']);
    await expect(window.getByTestId('status-view')).toHaveText('Table');
    await window.keyboard.press('Control+u');
    await expect(window.getByTestId('status-view')).toHaveText('Source');
  } finally {
    await close();
    removeTempHome(home);
  }
});

test("Settings' table defaults apply to a tab with no choice of its own (ADR-021)", async () => {
  const { home, files } = setUp({ 'plain.csv': 'a,b\n1,2\n' });
  saveFile(path.join(appDirs(home).config, 'settings.json'), '{"schemaVersion":1,"themeMode":"light","tableSeparator":"|","tableHeader":false}');
  const { window, close } = await launchApp(['--', files['plain.csv']!], { home });
  try {
    await expect(tableOptions(window)).toHaveText('Pipe · No header');
    await expect(headers(window)).toHaveText(['#', '1']);
    await expect(bodyRows(window).first().locator('[role=gridcell]')).toHaveText(['a,b']);
  } finally {
    await close();
    removeTempHome(home);
  }
});
