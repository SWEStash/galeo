import AxeBuilder from '@axe-core/playwright';
import { copyFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { killApp, launchApp, tempHome, removeTempHome } from '../helpers/launch';

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const plan = path.join(docs, 'plan-50k.md');
const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const divider = (window: Page) => shownDocument(window).getByRole('separator', { name: 'Resize source and preview' });

/** The source pane's share of the document area's width, in whole percent. */
async function sourceShare(window: Page): Promise<number> {
  const { source, rendered } = await panes(window);
  return Math.round((100 * (source[1] - source[0])) / (rendered[1] - source[0]));
}

function setWidth(app: ElectronApplication, page: Page, width: number) {
  return app.browserWindow(page).then((window) => window.evaluate((browserWindow, value) => browserWindow.setSize(value, 800), width));
}

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

test('the divider moves with the arrow keys, resets with Home, and a restart keeps split and where it was', async () => {
  const home = tempHome();
  try {
    const first = await launchApp(['--', plan], { home });
    try {
      await expect(shownDocument(first.window).locator('h1')).toBeVisible();
      await first.window.keyboard.press('ControlOrMeta+Backslash');
      await expect(divider(first.window)).toBeVisible();
      await divider(first.window).focus();
      await first.window.keyboard.press('ArrowRight');
      await first.window.keyboard.press('ArrowRight');
      await expect(divider(first.window)).toHaveAttribute('aria-valuenow', '60');
      await expect.poll(() => sourceShare(first.window)).toBe(60);
      await first.window.keyboard.press('Home');
      await expect(divider(first.window)).toHaveAttribute('aria-valuenow', '50');
      for (let i = 0; i < 6; i++) await first.window.keyboard.press('ArrowLeft');
      await expect(divider(first.window)).toHaveAttribute('aria-valuenow', '20');
      // The divider shows a move at once; the page tells main after its next render. Main has it once
      // a request sent after that render comes back (one page's messages arrive in order).
      await first.window.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await first.window.evaluate(() => window.galeo.tabs.snapshot());
    } finally {
      await first.close();
    }

    const second = await launchApp([], { home });
    try {
      await expect(divider(second.window)).toBeVisible();
      await expect(divider(second.window)).toHaveAttribute('aria-valuenow', '20');
      await expect(second.window.getByTestId('status-view')).toHaveText('Split');
    } finally {
      await second.close();
    }
  } finally {
    removeTempHome(home);
  }
});

test('the divider follows a drag, and a double-click puts it back at half', async () => {
  const { window, close } = await launchApp(['--', path.join(docs, 'basic.md')]);
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+Backslash');
    const grip = divider(window);
    await expect(grip).toBeVisible();
    const area = (await shownDocument(window).boundingBox())!;
    const box = (await grip.boundingBox())!;
    await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await window.mouse.down();
    await window.mouse.move(area.x + area.width * 0.3, box.y + box.height / 2, { steps: 5 });
    await window.mouse.up();
    await expect(grip).toHaveAttribute('aria-valuenow', '30');
    await grip.dblclick();
    await expect(grip).toHaveAttribute('aria-valuenow', '50');
  } finally {
    await close();
  }
});

test('a window too narrow for split shows the rendered view, or the source while editing, and split comes back wider', async () => {
  const dir = tempHome();
  const file = path.join(dir, 'basic.md');
  copyFileSync(path.join(docs, 'basic.md'), file);
  const { app, window, close } = await launchApp(['--', file]);
  try {
    const document = shownDocument(window);
    await expect(document.locator('h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+Backslash');
    await expect(document.locator('.cm-editor')).toBeVisible();

    await setWidth(app, window, 600);
    await expect(document.locator('.cm-editor')).toBeHidden();
    await expect(document.locator('h1')).toBeVisible();
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Editing');
    await expect(document.locator('.cm-content')).toBeFocused();
    await expect(document.locator('h1')).toBeHidden();

    await setWidth(app, window, 1100);
    await expect(document.locator('h1')).toBeVisible();
    await expect(document.locator('.cm-editor')).toBeVisible();
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Read-only');
  } finally {
    await close();
    removeTempHome(dir);
  }
});

test('edit mode keeps split with the caret in the editor; Ctrl+U leaves split for the source while editing, the rendered view when reading', async () => {
  const dir = tempHome();
  const file = path.join(dir, 'basic.md');
  copyFileSync(path.join(docs, 'basic.md'), file);
  const { app, window, close } = await launchApp(['--', file]);
  try {
    const document = shownDocument(window);
    await expect(document.locator('h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+Backslash');
    await expect(document.locator('.cm-editor')).toBeVisible();
    await pressInMain(app, window, 'E');
    await expect(document.locator('.cm-content')).toBeFocused();
    await expect(document.locator('h1')).toBeVisible();

    await window.keyboard.press('ControlOrMeta+U');
    await expect(document.locator('h1')).toBeHidden();
    await expect(window.getByTestId('status-view')).toHaveText('Source');
    await window.keyboard.press('ControlOrMeta+Backslash');
    await expect(document.locator('h1')).toBeVisible();
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Read-only');
    await expect(document.locator('.cm-editor')).toBeVisible();

    await window.keyboard.press('ControlOrMeta+U');
    await expect(document.locator('.cm-editor')).toBeHidden();
    await expect(window.getByTestId('status-view')).toHaveText('Rendered');
  } finally {
    await close();
    removeTempHome(dir);
  }
});

test('find searches the source pane, or the rendered pane once the reader clicks in it', async () => {
  const { window, close } = await launchApp(['--', path.join(docs, 'basic.md')]);
  try {
    const document = shownDocument(window);
    await expect(document.locator('h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+Backslash');
    await expect(document.locator('.cm-editor')).toBeVisible();
    // `**bold**` in the source, "bold" in the rendered text: only the source has the asterisks.
    await window.keyboard.press('ControlOrMeta+F');
    await window.keyboard.type('**bold');
    await expect(window.locator('.find-bar [role="status"]')).toHaveText('1 of 1');
    await window.keyboard.press('Escape');
    await document.locator('p').first().click();
    await window.keyboard.press('ControlOrMeta+F');
    await window.keyboard.press('ControlOrMeta+A');
    await window.keyboard.type('**bold');
    await expect(window.locator('.find-bar [role="status"]')).toHaveText('No matches');
  } finally {
    await close();
  }
});

test('split passes axe in both colour schemes', async () => {
  const { app, window, close } = await launchApp(['--', path.join(docs, 'basic.md')]);
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+Backslash');
    await expect(divider(window)).toBeVisible();
    for (const scheme of ['light', 'dark'] as const) {
      await app.evaluate(({ nativeTheme }, value) => (nativeTheme.themeSource = value), scheme);
      const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[data-testid="tab-panel"][data-active="true"]').analyze();
      expect(results.violations, scheme).toEqual([]);
    }
  } finally {
    await close();
  }
});

/** The first rendered block showing at the top of the rendered pane: its source lines. */
function renderedPaneTop(page: Page): Promise<{ line: number; end: number }> {
  return shownDocument(page).evaluate((host) => {
    const root = host.shadowRoot!;
    const top = root.querySelector('.galeo-rendered-pane')!.getBoundingClientRect().top;
    const block = [...root.querySelectorAll<HTMLElement>('article > [data-src-line]')].find((each) => each.getBoundingClientRect().bottom > top + 1)!;
    return { line: Number(block.dataset['srcLine']), end: Number(block.dataset['srcEnd']) };
  });
}

/** Scrolls the source pane so `line` is at its top, as the reader's own scrolling would. */
function scrollSourceTo(page: Page, line: number): Promise<void> {
  return shownDocument(page).evaluate((host, target) => {
    const root = host.shadowRoot!;
    const scroller = root.querySelector<HTMLElement>('.cm-scroller')!;
    const first = root.querySelector('.cm-line')!.getBoundingClientRect();
    const start = first.top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTop = start + (target - 1) * first.height;
  }, line);
}

const near = (value: number, wanted: number, slack: number) => Math.abs(value - wanted) <= slack;

/** Where both panes are, for the report when a sync check fails. */
async function describePanes(page: Page, heading: string): Promise<string> {
  const geometry = await shownDocument(page).evaluate((host, text) => {
    const root = host.shadowRoot!;
    const source = root.querySelector<HTMLElement>('.cm-scroller')!;
    const rendered = root.querySelector<HTMLElement>('.galeo-rendered-pane')!;
    const headingElement = [...root.querySelectorAll('h2')].find((each) => each.textContent?.includes(text));
    return {
      devicePixelRatio,
      sourceScrollTop: source.scrollTop,
      renderedScrollTop: rendered.scrollTop,
      headingFromRenderedTop: headingElement ? headingElement.getBoundingClientRect().top - rendered.getBoundingClientRect().top : null,
    };
  }, heading);
  return JSON.stringify({ sourceTopLine: await sourceTopLine(page), renderedPaneTop: await renderedPaneTop(page), ...geometry });
}

/** Polls `check`; when it fails, the error says where both panes are (CI shows only the log). */
async function pollPanes(page: Page, heading: string, check: () => Promise<boolean>): Promise<void> {
  try {
    await expect.poll(check).toBe(true);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n\nPanes: ${await describePanes(page, heading)}`, { cause: error });
  }
}

test('scrolling either pane brings the other to the same block', async () => {
  const { window, close } = await launchApp(['--', plan]);
  try {
    const document = shownDocument(window);
    await expect(document.locator('h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+Backslash');
    await expect(document.locator('.cm-editor')).toBeVisible();

    const dependencies = document.locator('h2', { hasText: '9. Dependency map' });
    const dependenciesLine = Number(await dependencies.getAttribute('data-src-line'));
    await dependencies.evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await pollPanes(window, '9. Dependency map', async () => near(await sourceTopLine(window), dependenciesLine, 1));

    const risks = document.locator('h2', { hasText: '10. Risks' });
    const risksLine = Number(await risks.getAttribute('data-src-line'));
    await scrollSourceTo(window, risksLine);
    await pollPanes(window, '10. Risks', async () => (await sourceTopLine(window)) === risksLine);
    await pollPanes(window, '10. Risks', async () => (await renderedPaneTop(window)).line === risksLine);
  } finally {
    await close();
  }
});

test('a scroll the page makes in the source just after it followed the rendered pane still leads', async () => {
  const { window, close } = await launchApp(['--', plan]);
  try {
    const document = shownDocument(window);
    await expect(document.locator('h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+Backslash');
    await expect(document.locator('.cm-editor')).toBeVisible();

    const risksLine = Number(await document.locator('h2', { hasText: '10. Risks' }).getAttribute('data-src-line'));
    // The rendered pane leads; one frame later the source has followed and is settling, and a
    // scroll without the reader's input (as find or the outline make) lands on it then.
    await document.evaluate(async (host, target) => {
      const root = host.shadowRoot!;
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      [...root.querySelectorAll('h2')].find((each) => each.textContent?.includes('9. Dependency map'))!.scrollIntoView({ block: 'start' });
      await frame();
      await frame();
      const scroller = root.querySelector<HTMLElement>('.cm-scroller')!;
      const first = root.querySelector('.cm-line')!.getBoundingClientRect();
      scroller.scrollTop = first.top - scroller.getBoundingClientRect().top + scroller.scrollTop + (target - 1) * first.height;
    }, risksLine);
    await pollPanes(window, '10. Risks', async () => (await sourceTopLine(window)) === risksLine);
    await pollPanes(window, '10. Risks', async () => (await renderedPaneTop(window)).line === risksLine);
  } finally {
    await close();
  }
});

test('inside a long code block the rendered pane follows the source line by line, not block by block', async () => {
  const { window, close } = await launchApp(['--', plan]);
  try {
    const document = shownDocument(window);
    await expect(document.locator('h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+Backslash');
    await expect(document.locator('.cm-editor')).toBeVisible();
    const block = document.locator('pre', { hasText: 'sign-off' }).first();
    const line = Number(await block.getAttribute('data-src-line'));
    const end = Number(await block.getAttribute('data-src-end'));
    expect(end - line).toBeGreaterThan(8);
    const middle = line + Math.floor((end - line) / 2);
    await scrollSourceTo(window, middle);
    await expect.poll(() => sourceTopLine(window)).toBe(middle);
    const wanted = (middle - line) / (end + 1 - line);
    // How far down the block the rendered pane's top is.
    const through = () =>
      block.evaluate((element) => {
        const pane = element.closest('.galeo-rendered-pane')!.getBoundingClientRect();
        const box = element.getBoundingClientRect();
        return (pane.top - box.top) / box.height;
      });
    await expect.poll(async () => near(await through(), wanted, 0.1)).toBe(true);
  } finally {
    await close();
  }
});

test('typing in split updates the preview once typing pauses', async () => {
  const dir = tempHome();
  const file = path.join(dir, 'draft.md');
  writeFileSync(file, '# Draft\n\nFirst paragraph.\n');
  const { app, window, close } = await launchApp(['--', file]);
  try {
    const document = shownDocument(window);
    await expect(document.locator('h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+Backslash');
    await pressInMain(app, window, 'E');
    await expect(document.locator('.cm-content')).toBeFocused();
    await window.keyboard.press('ControlOrMeta+End');
    await window.keyboard.type('\n## Typed heading');
    await expect(document.locator('h2')).toHaveText('Typed heading');
    // Unsaved: the preview shows the editor's text, the file is as it was.
    await expect(window.locator('.tab-indicator[data-indicator="unsaved changes"]')).toBeAttached();
  } finally {
    killApp(app);
    await close().catch(() => {});
    removeTempHome(dir);
  }
});

test('a paragraph typed in split leaves drawn diagrams as they are', async () => {
  const dir = tempHome();
  const file = path.join(dir, 'flow.md');
  writeFileSync(file, '# Flow\n\n```mermaid\ngraph TD\n  A[Start] --> B[Done]\n```\n\nA paragraph.\n');
  const { app, window, close } = await launchApp(['--', file]);
  try {
    const document = shownDocument(window);
    await expect(document.locator('h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+Backslash');
    await expect(document.locator('.cm-editor')).toBeVisible();
    await expect(document.locator('.galeo-diagram[data-state="rendered"]')).toBeVisible();
    // Drawing goes through "pending"; a diagram whose source didn't change comes back drawn.
    await document.evaluate((host) => {
      const seen: string[] = [];
      (globalThis as { __pending?: string[] }).__pending = seen;
      new MutationObserver((records) => {
        for (const record of records) {
          const target = record.target as HTMLElement;
          if (target.dataset?.['state'] === 'pending') seen.push('pending');
        }
      }).observe(host.shadowRoot!, { subtree: true, attributes: true, attributeFilter: ['data-state'] });
    });
    await pressInMain(app, window, 'E');
    await expect(document.locator('.cm-content')).toBeFocused();
    await window.keyboard.press('ControlOrMeta+End');
    await window.keyboard.type(' More words.');
    await expect(document.locator('article p').last()).toHaveText('A paragraph. More words.');
    await expect(document.locator('.galeo-diagram[data-state="rendered"]')).toBeVisible();
    expect(await window.evaluate(() => (globalThis as { __pending?: string[] }).__pending)).toEqual([]);
  } finally {
    killApp(app);
    await close().catch(() => {});
    removeTempHome(dir);
  }
});
