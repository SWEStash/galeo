import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from '../helpers/launch';

const fixtures = path.resolve(import.meta.dirname, '../fixtures');
const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const diagrams = (window: Page) => shownDocument(window).locator('.galeo-diagram');

/** Scrolls every diagram into view in turn and waits until each is drawn or shows its error. */
async function drawAll(window: Page) {
  const all = diagrams(window);
  const count = await all.count();
  for (let index = 0; index < count; index++) {
    await all.nth(index).scrollIntoViewIfNeeded();
    await expect(all.nth(index)).not.toHaveAttribute('data-state', 'pending');
  }
  return count;
}

/** Collects Chromium's CSP refusals, which must never happen (SR-02). */
function refusals(window: Page): string[] {
  const seen: string[] = [];
  window.on('console', (message) => {
    if (/Refused to|violates the following Content Security Policy/.test(message.text())) seen.push(message.text());
  });
  return seen;
}

test('diagrams are drawn as they come into view, named for screen readers, with failures shown in place', async () => {
  const { window, close } = await launchApp(['--', path.join(fixtures, 'docs', 'mermaid.md')]);
  const refused = refusals(window);
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    expect(await drawAll(window)).toBe(6);
    const [flow, sequence, , , , broken] = await diagrams(window).all();
    await expect(flow!).toHaveAttribute('role', 'img');
    await expect(flow!).toHaveAttribute('aria-label', 'Checkout flow');
    await expect(sequence!).toHaveAttribute('aria-label', 'Diagram');
    await expect(flow!.locator('svg')).toBeVisible();
    await expect(broken!).toHaveAttribute('data-state', 'error');
    await expect(broken!.locator('.galeo-block-error-message')).not.toBeEmpty();
    await expect(broken!.locator('code')).toContainText('A --> B -->');
    // Code that isn't a diagram is still highlighted.
    await expect(shownDocument(window).locator('pre.shiki')).toHaveCount(1);
    expect(refused).toEqual([]);
  } finally {
    await close();
  }
});

test('a diagram far below waits until it is scrolled to', async () => {
  const { window, close } = await launchApp(['--', path.join(fixtures, 'docs', 'heavy-diagrams.md')]);
  try {
    await expect(diagrams(window).first()).toHaveAttribute('data-state', 'rendered');
    await expect(diagrams(window).last()).toHaveAttribute('data-state', 'pending');
    await diagrams(window).last().scrollIntoViewIfNeeded();
    await expect(diagrams(window).last()).toHaveAttribute('data-state', 'rendered');
  } finally {
    await close();
  }
});

test('a document without diagrams never loads Mermaid', async () => {
  const { window, close } = await launchApp(['--', path.join(fixtures, 'docs', 'basic.md')]);
  try {
    await expect(shownDocument(window).locator('h1')).toBeVisible();
    const loaded = await window.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
    expect(loaded.filter((name) => /mermaid|purify/i.test(name))).toEqual([]);
  } finally {
    await close();
  }
});

test('hostile diagrams draw inert: no script, link, foreign content or outside URL, and no navigation', async () => {
  const { window, close } = await launchApp(['--', path.join(fixtures, 'payloads', 'mermaid.payloads.md')]);
  const refused = refusals(window);
  try {
    await expect(diagrams(window).first()).toBeAttached();
    const url = window.url();
    await drawAll(window);
    // Let pending loads, error events and animations run before checking.
    await window.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await window.evaluate(() => (window as { __galeoPwned?: unknown }).__galeoPwned)).toBeUndefined();
    const findings = await shownDocument(window)
      .locator('.galeo-diagram-svg')
      .evaluateAll((wrappers) =>
        wrappers.flatMap((wrapper) =>
          [...wrapper.shadowRoot!.querySelectorAll('*')].flatMap((element) => [
            ...(['a', 'foreignObject', 'script'].includes(element.localName) ? [`<${element.localName}>`] : []),
            ...[...element.attributes]
              .filter((attribute) => attribute.name.startsWith('on') || (/href$/.test(attribute.name) && !attribute.value.startsWith('#')))
              .map((attribute) => `${element.localName} ${attribute.name}="${attribute.value}"`),
          ]),
        ),
      );
    expect(findings).toEqual([]);
    // Over the edge limit: an error box, not a hang.
    await expect(diagrams(window).last()).toHaveAttribute('data-state', 'error');
    expect(window.url()).toBe(url);
    expect(refused).toEqual([]);
  } finally {
    await close();
  }
});

test('diagrams are drawn again when the colour scheme changes', async () => {
  const { app, window, close } = await launchApp(['--', path.join(fixtures, 'docs', 'mermaid.md')]);
  try {
    await app.evaluate(({ nativeTheme }) => (nativeTheme.themeSource = 'light'));
    const flow = diagrams(window).first();
    await expect(flow).toHaveAttribute('data-state', 'rendered');
    const svg = () => flow.locator('.galeo-diagram-svg').evaluate((wrapper) => wrapper.shadowRoot!.innerHTML);
    const light = await svg();
    await app.evaluate(({ nativeTheme }) => (nativeTheme.themeSource = 'dark'));
    await expect.poll(svg).not.toBe(light);
    await expect(flow).toHaveAttribute('data-state', 'rendered');
  } finally {
    await close();
  }
});
