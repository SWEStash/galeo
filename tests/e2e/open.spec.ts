import { readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp } from '../helpers/launch';

const fixture = (...parts: string[]) => path.resolve(import.meta.dirname, '../fixtures', ...parts);

test('opens a Markdown file from the command line, rendered', async () => {
  const { window, close } = await launchApp(['--', fixture('docs/basic.md')]);
  try {
    const document = window.getByTestId('document');
    await expect(document.locator('h1')).toHaveText('galeo basic fixture');
    await expect(document.locator('p').first()).toContainText('© 2026');
    await expect(document.locator('pre.shiki')).toHaveAttribute('data-src-line', '12');
    await expect(document.locator('a', { hasText: 'relative link' })).toHaveAttribute('href', 'other.md');
  } finally {
    await close();
  }
});

test('typesets math in the real worker', async () => {
  const { window, close } = await launchApp(['--', fixture('docs/math.md')]);
  try {
    await expect(window.getByTestId('document').locator('.katex-display')).toHaveCount(1);
  } finally {
    await close();
  }
});

test('reads documents only by the ids main handed out, never by path (SR-12)', async () => {
  const { window: page, close } = await launchApp(['--', fixture('docs/basic.md')]);
  try {
    await expect(page.getByTestId('document').locator('h1')).toBeVisible();
    const result = await page.evaluate(async () => {
      const [record] = await window.galeo.documents.list();
      const attempt = (id: string) =>
        window.galeo.documents.read(id).then(
          () => 'read',
          () => 'refused',
        );
      return {
        own: await attempt(record!.id),
        unknown: await attempt('00000000-0000-0000-0000-000000000000'),
        byPath: await attempt('/etc/passwd'),
      };
    });
    expect(result).toEqual({ own: 'read', unknown: 'refused', byPath: 'refused' });
  } finally {
    await close();
  }
});

// The execution hook for the payload corpus: in a real page, no payload may run script (each sets
// `window.__galeoPwned`) or make Chromium refuse something on CSP grounds (SR-02).
const payloads = readdirSync(fixture('payloads')).filter((file) => file.endsWith('.payloads.md'));

for (const file of payloads) {
  test(`payload file ${file} renders inert`, async () => {
    const { window, close } = await launchApp(['--', fixture('payloads', file)]);
    const refusals: string[] = [];
    window.on('console', (message) => {
      if (/Refused to|violates the following Content Security Policy/.test(message.text())) refusals.push(message.text());
    });
    try {
      await expect(window.getByTestId('document').locator('article')).not.toBeEmpty();
      // Let pending loads, error events and animations run before checking.
      await window.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      expect(await window.evaluate(() => (window as { __galeoPwned?: unknown }).__galeoPwned)).toBeUndefined();
      expect(refusals).toEqual([]);
    } finally {
      await close();
    }
  });
}
