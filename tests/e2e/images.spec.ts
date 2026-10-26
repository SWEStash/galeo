import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp } from '../helpers/launch';
import { windowControlsOverlap } from '../helpers/window-controls';

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
      const { tabs: [record] } = await window.galeo.tabs.snapshot();
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

test('an image larger than an icon opens in the viewer, by a click or its Expand button; a linked one follows its link', async () => {
  const zoom = path.resolve(import.meta.dirname, '../fixtures/docs/images/zoom.md');
  const { window, close } = await launchApp(['--', zoom]);
  try {
    const document = window.getByTestId('document');
    const chart = document.getByRole('img', { name: 'A bar chart' });
    await expect.poll(() => chart.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(480);
    // Two charts get a button; the 2 px dot is an icon and gets none.
    await expect(document.getByRole('button', { name: 'Expand image' })).toHaveCount(2);

    await chart.click();
    const viewer = window.getByRole('dialog', { name: 'A bar chart' });
    await expect(viewer).toBeVisible();
    const stage = viewer.getByTestId('zoom-stage');
    await expect(stage.locator('img')).toBeVisible();
    await expect.poll(async () => Number(await stage.getAttribute('data-scale'))).toBeGreaterThan(1);
    // Its bar stays clear of the window controls drawn over the title bar.
    expect(await windowControlsOverlap(window, viewer.getByRole('button', { name: 'Close' }))).toBeNull();
    const fitted = Number(await stage.getAttribute('data-scale'));
    await window.keyboard.press('-');
    await expect.poll(async () => Number(await stage.getAttribute('data-scale'))).toBeLessThan(fitted);
    const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[role="dialog"]').analyze();
    expect(results.violations).toEqual([]);
    await window.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);

    // From the keyboard: the image's Expand button, and focus comes back to it.
    const expand = document.getByRole('button', { name: 'Expand image' }).first();
    await expand.focus();
    await window.keyboard.press('Enter');
    await expect(viewer).toBeVisible();
    await window.keyboard.press('Escape');
    await expect(expand).toBeFocused();

    // A linked image: its button opens the viewer, a click on it follows the link.
    await document.getByRole('button', { name: 'Expand image' }).last().click();
    await expect(window.getByRole('dialog', { name: 'A linked chart' })).toBeVisible();
    await window.keyboard.press('Escape');
    await document.getByRole('img', { name: 'A linked chart' }).click();
    await expect(window.getByRole('tab', { selected: true })).toContainText('basic.md');
  } finally {
    await close();
  }
});

test('an SVG with only a viewBox shows in the page and in the viewer, its Expand button on its corner', async () => {
  const doc = path.resolve(import.meta.dirname, '../fixtures/docs/images/viewbox.md');
  const { window, close } = await launchApp(['--', doc]);
  try {
    const document = window.getByTestId('document');
    const drawing = document.getByRole('img', { name: 'A green box' });
    const chart = document.getByRole('img', { name: 'A bar chart' });
    await expect(document.getByRole('button', { name: 'Expand image' })).toHaveCount(2);
    // With no size of its own it fills the column, as a browser shows it; the chart keeps its 480 px.
    await expect.poll(async () => (await drawing.boundingBox())?.width ?? 0).toBeGreaterThan(480);
    expect((await chart.boundingBox())?.width).toBe(480);

    // Each Expand button sits on its own image's top-right corner.
    for (const [image, index] of [[drawing, 0], [chart, 1]] as const) {
      await image.hover();
      const box = (await image.boundingBox())!;
      const button = (await document.getByRole('button', { name: 'Expand image' }).nth(index).boundingBox())!;
      expect(button.x + button.width).toBeCloseTo(box.x + box.width - 4, 0);
      expect(button.y).toBeCloseTo(box.y + 4, 0);
    }

    await drawing.click();
    const viewer = window.getByRole('dialog', { name: 'A green box' });
    await expect(viewer.getByTestId('zoom-stage').locator('img')).toBeVisible();
    const shown = (await viewer.getByTestId('zoom-stage').locator('img').boundingBox())!;
    expect(shown.width / shown.height).toBeCloseTo(2, 1);
  } finally {
    await close();
  }
});

