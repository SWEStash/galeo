import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from '../helpers/launch';

const plan = path.resolve(import.meta.dirname, '../fixtures/docs/plan-50k.md');

/** The line number at the top of the source pane, read from its gutter. */
function sourceTopLine(page: Page): Promise<number> {
  return page.getByTestId('document').evaluate((host) => {
    const root = host.shadowRoot!;
    const top = root.querySelector('.cm-scroller')!.getBoundingClientRect().top;
    const numbers = [...root.querySelectorAll<HTMLElement>('.cm-lineNumbers .cm-gutterElement')];
    const first = numbers.find((element) => element.textContent && element.getBoundingClientRect().bottom > top + 1);
    return Number(first?.textContent);
  });
}

/** The left and right edges of the source and rendered panes. */
function panes(page: Page): Promise<{ source: [number, number]; rendered: [number, number] }> {
  return page.getByTestId('document').evaluate((host) => {
    const edges = (element: Element) => {
      const box = element.getBoundingClientRect();
      return [Math.round(box.left), Math.round(box.right)] as [number, number];
    };
    const root = host.shadowRoot!;
    return { source: edges(root.querySelector('.galeo-source')!), rendered: edges(root.querySelector('.galeo-rendered-pane')!) };
  });
}

test('Ctrl+\\ shows the source beside the rendered view at the same place; Ctrl+\\ again goes back', async () => {
  const { window, close } = await launchApp(['--', plan]);
  try {
    const document = window.getByTestId('document');
    const heading = document.locator('h2', { hasText: '9. Dependency map' });
    const line = Number(await heading.getAttribute('data-src-line'));
    await heading.evaluate((element) => element.scrollIntoView({ block: 'start' }));

    await window.keyboard.press('ControlOrMeta+Backslash');
    await expect(document.locator('.cm-editor')).toBeVisible();
    await expect(heading).toBeVisible();
    const { source, rendered } = await panes(window);
    expect(source[1]).toBeLessThanOrEqual(rendered[0] + 1);
    expect(source[0]).toBeLessThan(rendered[0]);
    await expect.poll(() => sourceTopLine(window)).toBe(line);
    await window.screenshot({ path: test.info().outputPath('split.png') });

    await window.keyboard.press('ControlOrMeta+Backslash');
    await expect(document.locator('.cm-editor')).toBeHidden();
    await expect(heading).toBeInViewport();
  } finally {
    await close();
  }
});
