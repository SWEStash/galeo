import AxeBuilder from '@axe-core/playwright';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from '../helpers/launch';

// axe on the surfaces the other suites don't check, in both colour schemes (M5.3). The tab bar,
// palette, quick open, find bar, outline, settings, status bar, profile menu and dialogs, empty
// window and About are checked where they are tested.

const fixture = (name: string) => path.resolve(import.meta.dirname, '../fixtures/docs', name);
const shownPanel = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"]');
const SCHEMES = ['light', 'dark'] as const;

async function violations(window: Page, selector: string) {
  const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include(selector).analyze();
  return results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`);
}

function setScheme(app: ElectronApplication, scheme: (typeof SCHEMES)[number]) {
  return app.evaluate(({ nativeTheme }, value) => (nativeTheme.themeSource = value), scheme);
}

for (const scheme of SCHEMES) {
  test.describe(`${scheme} scheme`, () => {
    test('rendered documents: prose, GFM, code, math and diagrams', async () => {
      const { app, window, close } = await launchApp(['--', fixture('gfm.md'), fixture('math.md'), fixture('mermaid.md'), fixture('basic.md')]);
      try {
        await setScheme(app, scheme);
        for (const name of [/gfm\.md/, /math\.md/, /mermaid\.md/, /basic\.md/]) {
          await window.getByRole('tab', { name }).click();
          await expect(shownPanel(window).getByTestId('document').locator('article > *').first()).toBeVisible();
          for (const diagram of await shownPanel(window).locator('.galeo-diagram').all()) {
            await diagram.scrollIntoViewIfNeeded();
            await expect(diagram).not.toHaveAttribute('data-state', 'pending');
          }
          expect(await violations(window, '[data-testid="tab-panel"][data-active="true"]'), String(name)).toEqual([]);
        }
      } finally {
        await close();
      }
    });

    test('source and log views', async () => {
      const { app, window, close } = await launchApp(['--', fixture('sample.log'), fixture('basic.md')]);
      try {
        await setScheme(app, scheme);
        await window.getByRole('tab', { name: /sample\.log/ }).click();
        await expect(shownPanel(window).getByTestId('document').locator('.cm-editor')).toBeVisible();
        expect(await violations(window, '[data-testid="tab-panel"][data-active="true"]'), 'log').toEqual([]);
        await window.getByRole('tab', { name: /basic\.md/ }).click();
        await window.keyboard.press('ControlOrMeta+U');
        await expect(shownPanel(window).getByTestId('document').locator('.cm-editor')).toBeVisible();
        expect(await violations(window, '[data-testid="tab-panel"][data-active="true"]'), 'source').toEqual([]);
      } finally {
        await close();
      }
    });

    test('document states and banners', async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'galeo-a11y-'));
      const big = path.join(dir, 'big.md');
      writeFileSync(big, `# Big\n\n${'A line of an oversized plan.\n'.repeat(200_000)}`);
      const slow = path.join(dir, 'slow.md');
      writeFileSync(slow, Array.from({ length: 2000 }, (_, level) => `${'  '.repeat(level)}- item`).join('\n'));
      const { app, window, close } = await launchApp(['--', path.join(dir, 'gone.md'), big, slow, fixture('latin1.txt')]);
      try {
        await setScheme(app, scheme);
        const check = async (name: RegExp, ready: string) => {
          await window.getByRole('tab', { name }).click();
          await expect(shownPanel(window).locator(ready)).toBeVisible({ timeout: 20_000 });
          expect(await violations(window, '[data-testid="tab-panel"][data-active="true"]'), String(name)).toEqual([]);
        };
        await check(/gone\.md/, '[data-testid="document-state"]');
        await check(/big\.md/, '[data-banner="too-large"]');
        await check(/slow\.md/, '[data-banner="render-slow"]');
        await check(/latin1\.txt/, '[data-banner="encoding"]');
      } finally {
        await close();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test('the sandbox unavailable window', async () => {
      const { app, window, close } = await launchApp(['--no-sandbox', '--galeo-sandbox-unavailable=apparmor-userns']);
      try {
        await setScheme(app, scheme);
        await expect(window.getByRole('button').first()).toBeVisible();
        expect(await violations(window, 'body')).toEqual([]);
      } finally {
        await close();
      }
    });
  });
}
