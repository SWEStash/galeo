import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp } from '../helpers/launch';

const index = path.resolve(import.meta.dirname, '../fixtures/docs/images/index.md');

test('relative images, Markdown or raw HTML, render from opaque galeo://file URLs', async () => {
  const { window, close } = await launchApp(['--', index]);
  try {
    const document = window.getByTestId('document');
    for (const name of ['A red dot', 'A blue square']) {
      const image = document.getByRole('img', { name });
      await expect(image).toHaveAttribute('src', /^galeo:\/\/file\/[0-9a-f-]{36}$/);
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
    }
  } finally {
    await close();
  }
});

test('an image that is missing or not an image shows a placeholder', async () => {
  const { window, close } = await launchApp(['--', index]);
  try {
    const refused = window.getByTestId('document').locator('.galeo-image-refused');
    await expect(refused).toHaveText(['Image not shown: pics/gone.png', 'Image not shown: notes.txt']);
  } finally {
    await close();
  }
});

test('the page gets no image the document does not show, and cannot guess one (ADR-004)', async () => {
  const { window: page, close } = await launchApp(['--', index]);
  try {
    const granted = page.getByTestId('document').getByRole('img', { name: 'A red dot' });
    await expect(granted).toHaveAttribute('src', /^galeo:\/\/file\//);
    const url = (await granted.getAttribute('src'))!;
    const results = await page.evaluate(async (grantedUrl) => {
      const [record] = await window.galeo.documents.list();
      // Images may load from galeo: (the CSP's img-src); nothing else can read them.
      const load = (target: string) =>
        new Promise((resolve) => {
          const image = new Image();
          image.onload = () => resolve('loaded');
          image.onerror = () => resolve('error');
          image.src = target;
        });
      const read = (target: string) => fetch(target).then(() => 'read', () => 'blocked');
      return {
        forged: await window.galeo.documents.resolveImage(record!.id, '/etc/passwd'),
        sibling: await window.galeo.documents.resolveImage(record!.id, 'index.md'),
        guessed: await load('galeo://file/00000000-0000-0000-0000-000000000000'),
        byPath: await load('galeo://file/etc/passwd'),
        granted: await load(grantedUrl),
        fetched: await read(grantedUrl),
      };
    }, url);
    expect(results).toEqual({
      forged: { kind: 'refused', reason: 'not-in-document' },
      sibling: { kind: 'refused', reason: 'not-in-document' },
      guessed: 'error',
      byPath: 'error',
      granted: 'loaded',
      fetched: 'blocked',
    });
  } finally {
    await close();
  }
});
