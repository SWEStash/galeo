import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from '../helpers/launch';

const plan = path.resolve(import.meta.dirname, '../fixtures/docs/plan-50k.md');

/** The line number at the top of the source view, read from its gutter. */
function sourceTopLine(page: Page): Promise<number> {
  return page.getByTestId('document').evaluate((host) => {
    const root = host.shadowRoot!;
    const top = root.querySelector('.cm-scroller')!.getBoundingClientRect().top;
    const numbers = [...root.querySelectorAll<HTMLElement>('.cm-lineNumbers .cm-gutterElement')];
    const first = numbers.find((element) => element.textContent && element.getBoundingClientRect().bottom > top + 1);
    return Number(first?.textContent);
  });
}

/** The source line of the first rendered block at the top of the document area. */
function renderedTopLine(page: Page): Promise<number> {
  return page.getByTestId('document').evaluate((host) => {
    const top = host.getBoundingClientRect().top;
    const blocks = [...host.shadowRoot!.querySelectorAll<HTMLElement>('article [data-src-line]')];
    return Number(blocks.find((block) => block.getBoundingClientRect().bottom > top + 1)?.dataset['srcLine']);
  });
}

test('Ctrl+U switches to the source at the same place, and back', async () => {
  const { window, close } = await launchApp(['--', plan]);
  try {
    const document = window.getByTestId('document');
    const heading = document.locator('h2', { hasText: '9. Dependency map' });
    const line = Number(await heading.getAttribute('data-src-line'));
    expect(line).toBeGreaterThan(100);
    await heading.evaluate((element) => element.scrollIntoView({ block: 'start' }));

    await window.keyboard.press('ControlOrMeta+U');
    await expect(document.locator('.cm-editor')).toBeVisible();
    await expect.poll(() => sourceTopLine(window)).toBe(line);

    await window.keyboard.press('ControlOrMeta+U');
    await expect(heading).toBeVisible();
    await expect.poll(() => renderedTopLine(window)).toBe(line);
  } finally {
    await close();
  }
});

test('Alt+Z wraps long lines in the source view', async () => {
  const { window, close } = await launchApp(['--', plan]);
  try {
    const document = window.getByTestId('document');
    await expect(document.locator('h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+U');
    const content = document.locator('.cm-content');
    await expect(content).not.toHaveClass(/cm-lineWrapping/);
    await window.keyboard.press('Alt+Z');
    await expect(content).toHaveClass(/cm-lineWrapping/);
  } finally {
    await close();
  }
});
