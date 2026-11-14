// The website's still of the live demo (site/screenshots/demo-*.png, #65): what the demo shows first, so the
// picture a visitor clicks is the page that loads. Not part of CI: run `npm run build:demo`, then
// `npm run headless -- npm run site:screenshots`.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { serveStatic } from '../demo/serve';
import { HEIGHT, WIDTH } from './shoot';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DEMO = path.join(ROOT, 'out/demo');
const OUT = path.join(ROOT, 'site/screenshots');

for (const theme of ['light', 'dark'] as const) {
  test(`the demo's first view, ${theme}`, async () => {
    test.skip(!existsSync(path.join(DEMO, 'index.html')), 'run `npm run build:demo` first');
    mkdirSync(OUT, { recursive: true });
    const server = await serveStatic(DEMO);
    const env = { ...process.env, GALEO_DEMO_URL: server.url, GALEO_DEMO_SIZE: `${WIDTH}x${HEIGHT}` };
    const app = await electron.launch({ args: [path.join(ROOT, 'tests/demo/host.mjs')], chromiumSandbox: true, cwd: ROOT, env: env as Record<string, string> });
    try {
      const page = await app.firstWindow();
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: false });
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
      await expect(page.getByRole('heading', { name: 'Garden shed rebuild', level: 1 })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(800);
      await page.mouse.move(WIDTH - 2, HEIGHT - 2);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path.join(OUT, `demo-${theme}.png`), Buffer.from(data, 'base64'));
    } finally {
      await app.close();
      await server.close();
    }
  });
}
