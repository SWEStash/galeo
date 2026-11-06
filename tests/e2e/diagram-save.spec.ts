import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, removeTempHome, tempHome } from '../helpers/launch';

// Save a diagram (#59): main asks where (answered here by GALEO_TEST_SAVE_PATH) and writes only that file.
const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const savePath = (app: ElectronApplication, file: string) => app.evaluate((_electron, value) => void (process.env['GALEO_TEST_SAVE_PATH'] = value), file);

test("the viewer saves the diagram as the SVG galeo shows, or as a PNG drawn from it", async () => {
  const dir = tempHome();
  const svg = path.join(dir, 'checkout.svg');
  const png = path.join(dir, 'checkout.png');
  const { app, window, close } = await launchApp(['--', path.join(docs, 'mermaid.md')], { env: { GALEO_TEST_SAVE_PATH: svg } });
  try {
    const diagram = shownDocument(window).locator('.galeo-diagram').first();
    await expect(diagram.locator('.galeo-diagram-svg svg')).toBeVisible({ timeout: 15_000 });
    await diagram.hover();
    await diagram.getByRole('button', { name: 'Expand diagram' }).click();
    const viewer = window.getByRole('dialog', { name: 'Checkout flow' });
    await expect(viewer).toBeVisible();

    await viewer.getByRole('button', { name: 'Save as SVG…' }).click();
    await expect.poll(() => existsSync(svg)).toBe(true);
    const text = readFileSync(svg, 'utf8');
    expect(text.startsWith('<svg')).toBe(true);
    expect(text).not.toMatch(/<script|foreignObject|\son[a-z]+=/i);
    await expect(window.getByTestId('status-message')).toHaveText('Saved the diagram');

    await savePath(app, png);
    await viewer.getByRole('button', { name: 'Save as PNG…' }).click();
    await expect.poll(() => existsSync(png)).toBe(true);
    const bytes = readFileSync(png);
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.length).toBeGreaterThan(1000);

    // Cancelling the dialog writes nothing and says nothing.
    await savePath(app, '');
    await viewer.getByRole('button', { name: 'Save as SVG…' }).click();
    await expect(viewer).toBeVisible();
  } finally {
    await close();
    removeTempHome(dir);
  }
});
