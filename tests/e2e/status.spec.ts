import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, tempHome } from '../helpers/launch';

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const basic = path.join(docs, 'basic.md');
const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');

test('the status bar shows the path, view, read-only, encoding and metrics, and passes axe', async () => {
  const { window, close } = await launchApp(['--', basic]);
  try {
    const bar = window.getByTestId('status-bar');
    await expect(bar.getByTestId('status-path')).toHaveText(basic);
    await expect(bar.getByTestId('status-view')).toHaveText('Rendered');
    await expect(bar.getByTestId('status-mode')).toHaveText('Read-only');
    await expect(bar.getByTestId('status-encoding')).toHaveText('UTF-8');
    // The rendered view wraps to the window: no line count, only the words.
    await expect(bar.getByTestId('status-metrics')).toHaveText(/^[\d,]+ words · .+ min$/);
    await window.keyboard.press('ControlOrMeta+U');
    await expect(bar.getByTestId('status-view')).toHaveText('Source');
    await expect(bar.getByTestId('status-metrics')).toHaveText(/^\d+ ln · [\d,]+ words · .+ min$/);
    const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('.status-bar').analyze();
    expect(results.violations).toEqual([]);
  } finally {
    await close();
  }
});

test('the status bar counts lines in the source view, the words of prose and their reading time, and follows a reload', async () => {
  const home = tempHome();
  const dir = path.join(home, 'docs');
  mkdirSync(dir, { recursive: true });
  const md = path.join(dir, 'words.md');
  const prose = (count: number) => Array.from({ length: count }, (_, n) => `word${n}`).join(' ');
  writeFileSync(md, `# Title here\n\n${prose(458)}\n\n\`\`\`js\nconst notCounted = 1;\n\`\`\`\n`);
  const txt = path.join(dir, 'notes.txt');
  writeFileSync(txt, 'One two three.\n');
  const log = path.join(dir, 'app.log');
  writeFileSync(log, '2026-10-06 INFO started\n');
  const { window, close } = await launchApp(['--', md, txt, log], { home });
  try {
    const metrics = window.getByTestId('status-metrics');
    await expect(metrics).toHaveText('460 words · 2 min');
    // The source view of the same file keeps its words and adds its lines.
    await window.keyboard.press('ControlOrMeta+U');
    await expect(window.getByTestId('status-view')).toHaveText('Source');
    await expect(metrics).toHaveText('8 ln · 460 words · 2 min');
    await window.keyboard.press('ControlOrMeta+U');
    writeFileSync(md, `# Title here\n\n${prose(8)}\n`);
    await expect(metrics).toHaveText('10 words · < 1 min');
    await window.keyboard.press('Control+Tab');
    await expect(window.getByTestId('status-view')).toHaveText('Reader');
    await expect(metrics).toHaveText('3 words · < 1 min');
    await window.keyboard.press('Control+Tab');
    await expect(window.getByTestId('status-view')).toHaveText('Source');
    // A log has lines and no prose.
    await expect(metrics).toHaveText('2 ln');
  } finally {
    await close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("the path's menu, built by main, copies the path", async () => {
  const { app, window, close } = await launchApp(['--', basic], { env: { GALEO_TEST_MENU_CHOICE: 'copy-path' } });
  try {
    await app.evaluate(({ clipboard }) => clipboard.writeText('before'));
    await window.getByTestId('status-path').click();
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe(basic);
    const menus = await app.evaluate(() => (globalThis as { __galeoMenus?: { label: string }[][] }).__galeoMenus);
    expect(menus?.[0]?.map((item) => item.label)).toEqual(['Copy path', 'Reveal in Files']);
  } finally {
    await close();
  }
});

test("the path's menu reveals the file in the file manager", async () => {
  const { app, window, close } = await launchApp(['--', basic], { env: { GALEO_TEST_MENU_CHOICE: 'reveal', GALEO_TEST_EXTERNAL: 'record' } });
  try {
    await window.getByTestId('status-path').click();
    await expect.poll(() => app.evaluate(() => (globalThis as { __galeoRevealed?: string[] }).__galeoRevealed)).toEqual([basic]);
  } finally {
    await close();
  }
});

test('Reopen with encoding reads the file again as chosen, and the status bar says so', async () => {
  const { window, close } = await launchApp(['--', path.join(docs, 'latin1.txt')]);
  try {
    const banner = window.locator('[data-banner="encoding"]');
    await expect(banner).toContainText('Windows-1252');
    await banner.getByRole('button', { name: 'Reopen with encoding…' }).click();
    await window.getByRole('menuitem', { name: 'UTF-8' }).click();
    await expect(shownDocument(window).locator('article p')).toHaveText('Caf� cr�me � fran�ais');
    await expect(banner).toHaveCount(0);
    await expect(window.getByTestId('status-encoding')).toHaveText('UTF-8');
    await expect(window.getByTestId('status-view')).toHaveText('Reader');
    await window.getByTestId('status-encoding').click();
    await window.getByRole('menuitem', { name: 'Windows-1252' }).click();
    await expect(shownDocument(window).locator('article p')).toHaveText('Café crème – français');
  } finally {
    await close();
  }
});

test('zoom is per tab: Ctrl++ (or Ctrl+=) zooms this tab only, Ctrl+0 resets it', async () => {
  const { window, close } = await launchApp(['--', basic, path.join(docs, 'gfm.md')]);
  try {
    await expect(shownDocument(window)).toBeVisible();
    // Ctrl++ on a US layout, where + is Shift+=.
    await window.keyboard.press('ControlOrMeta+Shift+Equal');
    await expect(window.getByTestId('status-zoom')).toHaveText('110%');
    await window.keyboard.press('ControlOrMeta+Equal');
    await expect(window.getByTestId('status-zoom')).toHaveText('125%');
    await expect(shownDocument(window)).toHaveCSS('zoom', '1.25');
    await window.keyboard.press('Control+Tab');
    await expect(shownDocument(window)).toBeVisible();
    await expect(window.getByTestId('status-zoom')).toHaveCount(0);
    await window.keyboard.press('Control+Tab');
    await expect(window.getByTestId('status-zoom')).toHaveText('125%');
    await window.keyboard.press('ControlOrMeta+0');
    await expect(window.getByTestId('status-zoom')).toHaveCount(0);
  } finally {
    await close();
  }
});

test('Ctrl and the wheel zoom the shown tab: up zooms in, down zooms out, over the tab bar too', async () => {
  const { window, close } = await launchApp(['--', basic]);
  try {
    await expect(shownDocument(window)).toBeVisible();
    const over = async (selector: string) => {
      const box = (await window.locator(selector).first().boundingBox())!;
      await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    };
    await over('[data-testid="document"]');
    // portable: Ctrl and the wheel zoom on macOS too (the trackpad's pinch sends Ctrl).
    await window.keyboard.down('Control');
    await window.mouse.wheel(0, -120);
    await expect(window.getByTestId('status-zoom')).toHaveText('110%');
    await window.mouse.wheel(0, -120);
    await expect(window.getByTestId('status-zoom')).toHaveText('125%');
    await over('[role="tab"]');
    await window.mouse.wheel(0, 120);
    await expect(window.getByTestId('status-zoom')).toHaveText('110%');
    await window.keyboard.up('Control'); // portable: see above
    await expect(shownDocument(window)).toHaveCSS('zoom', '1.1');
  } finally {
    await close();
  }
});

test('tabs with the same file name show the parent that tells them apart, and the full path on hover', async () => {
  const dir = tempHome();
  for (const folder of ['acme', 'beta']) {
    mkdirSync(path.join(dir, folder));
    writeFileSync(path.join(dir, folder, 'plan.md'), `# ${folder}\n`);
  }
  const { window, close } = await launchApp(['--', path.join(dir, 'acme', 'plan.md'), path.join(dir, 'beta', 'plan.md')]);
  try {
    const labels = window.locator('.tab-label');
    await expect(labels).toHaveText(['acme/plan.md', 'beta/plan.md']);
    await expect(labels.first()).toHaveAttribute('title', path.join(dir, 'acme', 'plan.md'));
  } finally {
    await close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a log following its end says so in its tab's name; a hibernated tab is dimmed", async () => {
  const { window, close } = await launchApp(['--', path.join(docs, 'sample.log'), basic]);
  try {
    await expect(shownDocument(window).locator('.cm-editor')).toBeVisible();
    await shownDocument(window).click();
    await window.keyboard.press('End');
    await expect(window.getByRole('tab', { name: /sample\.log.*following the end/ })).toBeVisible();
    await expect(window.getByRole('tab', { name: /basic\.md/ })).toHaveAttribute('data-hibernated', 'true');
  } finally {
    await close();
  }
});
