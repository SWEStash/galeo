import AxeBuilder from '@axe-core/playwright';
import { existsSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { serveStatic } from './serve';

// The website with the live demo in it (#65): site/ and `npm run build:demo`'s out/demo, laid out and served as
// Pages serves them, opened in Electron's Chromium as a plain web page (tests/demo/host.mjs).
const ROOT = path.resolve(import.meta.dirname, '../..');
const DEMO = path.join(ROOT, 'out/demo');

let dir: string;
let server: Awaited<ReturnType<typeof serveStatic>>;

test.beforeAll(async () => {
  test.skip(!existsSync(path.join(DEMO, 'index.html')), 'run `npm run build:demo` first');
  dir = mkdtempSync(path.join(tmpdir(), 'galeo-site-'));
  for (const name of readdirSync(path.join(ROOT, 'site'))) symlinkSync(path.join(ROOT, 'site', name), path.join(dir, name));
  symlinkSync(DEMO, path.join(dir, 'demo'));
  server = await serveStatic(dir);
});

test.afterAll(async () => {
  await server?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** The site in a window of `size`, with or without script; `messages` collects the console's errors. */
async function open(size = '1280x900', { script = true } = {}) {
  const env = { ...process.env, GALEO_DEMO_URL: server.url, GALEO_DEMO_SIZE: size, ...(script ? {} : { GALEO_DEMO_NO_SCRIPT: '1' }) };
  const app = await electron.launch({ args: [path.join(import.meta.dirname, 'host.mjs')], chromiumSandbox: true, cwd: ROOT, env: env as Record<string, string> });
  const page = await app.firstWindow();
  const messages: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
  await page.waitForLoadState('load');
  return { app, page, messages };
}

const requests = (app: ElectronApplication) => app.evaluate(() => (globalThis as { __demoRequests?: string[] }).__demoRequests ?? []);
const demoFrame = (page: Page) => page.frameLocator('iframe[title^="galeo"]');

test('loads the demo in the page only when asked, from the site alone', async () => {
  const { app, page, messages } = await open();
  try {
    expect((await requests(app)).some((url) => url.includes('/demo/'))).toBe(false);
    const start = page.getByRole('button', { name: 'Try it live' });
    await expect(start).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open the live demo' })).toBeHidden();
    // By keyboard: the button is reachable, and the demo takes the focus once it's there.
    await start.focus();
    await page.keyboard.press('Enter');
    await expect(demoFrame(page).getByRole('tab')).toHaveCount(6);
    await expect(demoFrame(page).getByRole('heading', { name: 'Garden shed rebuild', level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('IFRAME');
    await page.waitForLoadState('networkidle');
    for (const url of await requests(app)) expect(new URL(url).origin, url).toBe(new URL(server.url).origin);
    expect(messages).toEqual([]);
  } finally {
    await app.close();
  }
});

test('steps through the screenshots one at a time', async () => {
  const { app, page } = await open();
  try {
    const gallery = page.locator('.gallery');
    const previous = gallery.getByRole('button', { name: 'Previous screenshot' });
    const next = gallery.getByRole('button', { name: 'Next screenshot' });
    const count = await gallery.locator('li').count();
    await expect(gallery).toContainText(`1 / ${count}`);
    await expect(previous).toBeDisabled();
    await next.click();
    await expect(gallery).toContainText(`2 / ${count}`);
    await expect(previous).toBeEnabled();
    for (let i = 2; i < count; i++) await next.click();
    await expect(gallery).toContainText(`${count} / ${count}`);
    await expect(next).toBeDisabled();
  } finally {
    await app.close();
  }
});

for (const scheme of ['light', 'dark'] as const) {
  test(`passes axe in the ${scheme} scheme, the demo's still and button included`, async () => {
    const { app, page } = await open();
    try {
      await page.emulateMedia({ colorScheme: scheme });
      const results = await new AxeBuilder({ page }).setLegacyMode(true).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    } finally {
      await app.close();
    }
  });
}

test('on a phone, the demo is a link and nothing scrolls sideways', async () => {
  const { app, page } = await open('400x800');
  try {
    await expect(page.getByRole('link', { name: 'Open the live demo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try it live' })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await app.close();
  }
});

test('without script, the demo is a link and every screenshot is in the row', async () => {
  const { app, page } = await open('1280x900', { script: false });
  try {
    await expect(page.getByRole('link', { name: 'Open the live demo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try it live' })).toBeHidden();
    await expect(page.locator('.gallery li img')).toHaveCount(7);
    await expect(page.locator('.gallery-nav')).toHaveCount(0);
  } finally {
    await app.close();
  }
});
