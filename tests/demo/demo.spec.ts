import { existsSync } from 'node:fs';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { serveStatic } from './serve';

// The website's live demo (#41), as `npm run build:demo` writes it to out/demo, served as Pages serves it and
// opened in Electron's own Chromium as a plain web page (tests/demo/host.mjs).
const ROOT = path.resolve(import.meta.dirname, '../..');
const DEMO = path.join(ROOT, 'out/demo');
/** What the first view may download: the app's page, the plan sample and its fonts; the rest loads on demand. */
const FIRST_VIEW_MAX_BYTES = 6 * 1000 * 1000;

let server: Awaited<ReturnType<typeof serveStatic>>;
let app: ElectronApplication;
let page: Page;

const panel = () => page.locator('[data-testid="tab-panel"][data-active="true"]');
const shown = () => panel().locator('[data-testid="document"]');
const requests = () => app.evaluate(() => (globalThis as { __demoRequests?: string[] }).__demoRequests ?? []);
const palette = () => page.getByTestId('palette');

async function run(query: string) {
  await page.keyboard.press('ControlOrMeta+Shift+P');
  await palette().getByRole('combobox').fill(query);
  await page.keyboard.press('Enter');
  await expect(palette()).toHaveCount(0);
}

async function show(name: string) {
  await page.getByRole('tab', { name: new RegExp(name.replace('.', '\\.')) }).click();
  await expect(page.locator('footer').first()).toContainText(`/home/demo/shed/${name}`);
}

test.beforeAll(async () => {
  test.skip(!existsSync(path.join(DEMO, 'index.html')), 'run `npm run build:demo` first');
  server = await serveStatic(DEMO);
  app = await electron.launch({ args: [path.join(import.meta.dirname, 'host.mjs')], chromiumSandbox: true, cwd: ROOT, env: { ...process.env, GALEO_DEMO_URL: server.url } as Record<string, string> });
  page = await app.firstWindow();
});

test.afterAll(async () => {
  await app?.close();
  await server?.close();
});

test('shows the plan first, within its first-view budget, asking nothing of any other origin', async () => {
  await expect(page.getByRole('tab')).toHaveCount(6);
  await expect(shown().getByRole('heading', { name: 'Garden shed rebuild', level: 1 })).toBeVisible();
  await expect(page.locator('footer').first()).toContainText('2 of 6 tasks');
  await page.waitForLoadState('networkidle');
  expect(server.sent()).toBeLessThan(FIRST_VIEW_MAX_BYTES);
  expect((await requests()).filter((url) => !url.startsWith(server.url))).toEqual([]);
});

test('renders every sample: diagrams, maths, a table, a tree, and a log that grows', async () => {
  await show('frame.md');
  await expect(shown().locator('svg[id^="galeo-diagram"]')).toHaveCount(3);
  await show('roof.md');
  await expect(shown().locator('.katex').first()).toBeVisible();
  await show('materials.csv');
  await expect(page.locator('footer').first()).toContainText('Table');
  await show('order.json');
  await expect(page.locator('footer').first()).toContainText('Tree');
  await show('delivery.log');
  await expect(page.locator('footer').first()).toContainText(/\d+ ln/);
  const lines = async () => Number((await page.locator('footer').first().innerText()).match(/(\d+) ln/)![1]);
  const before = await lines();
  await expect.poll(lines, { timeout: 15_000 }).toBeGreaterThan(before);
  expect((await requests()).filter((url) => !url.startsWith(server.url))).toEqual([]);
});

test('tab search, the overview, the outline, find, pinning and the theme work', async () => {
  await show('plan.md');
  await page.keyboard.press('ControlOrMeta+Shift+A');
  await page.getByTestId('tab-search').getByRole('combobox').fill('roof');
  await page.keyboard.press('Enter');
  await expect(page.locator('footer').first()).toContainText('/home/demo/shed/roof.md');

  await page.keyboard.press('ControlOrMeta+Shift+E');
  await expect(page.getByTestId('tab-overview')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tab-overview')).toHaveCount(0);

  await show('plan.md');
  await run('Toggle outline');
  await expect(page.getByRole('navigation', { name: 'Outline' }).getByRole('button', { name: 'Budget' })).toBeVisible();

  await page.keyboard.press('ControlOrMeta+f');
  await page.keyboard.type('timber');
  await expect(page.getByRole('searchbox', { name: 'Find in document' })).toHaveValue('timber');
  await page.keyboard.press('Escape');

  await run('Pin or unpin tab');
  await expect(page.getByRole('tab').first().locator('.tab-pin')).toBeVisible();

  await page.keyboard.press('ControlOrMeta+Comma');
  const settings = page.getByTestId('settings-view');
  await settings.getByText('Dark', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'dark');
  await settings.getByText('System', { exact: true }).click();
});

test('Ctrl+E edits a sample in memory and Ctrl+S saves it', async () => {
  await show('roof.md');
  await page.keyboard.press('ControlOrMeta+e');
  await expect(page.locator('footer').first()).toContainText('Editing');
  await panel().locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.type('Edited in the demo. ');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('footer').first()).toContainText('Saved');
  await page.keyboard.press('ControlOrMeta+e');
  await expect(page.locator('footer').first()).toContainText('Read-only');
  await expect(panel().locator('.cm-content')).toContainText('Edited in the demo.');
});

test('what needs the app says so, with a link to install it', async () => {
  await page.keyboard.press('ControlOrMeta+p');
  const notice = page.getByRole('status').filter({ hasText: 'Quick open searches your folders in the app' });
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('link', { name: 'Install galeo' })).toHaveAttribute('href', '../#install');
  await page.keyboard.press('Escape');
  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await expect(notice).toBeHidden();
});
