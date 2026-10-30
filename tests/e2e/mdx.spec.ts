import AxeBuilder from '@axe-core/playwright';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { launchApp, removeTempHome, tempHome } from '../helpers/launch';

const pics = path.resolve(import.meta.dirname, '../fixtures/docs/images/pics');
const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');

const ARTICLE = `---
title: Release notes
---
import Callout from '../components/Callout.astro';
export const version = '0.2';

# Release notes

<Callout type="warning" open>
Read **this** first, then [the next part](next.md).
</Callout>

The version is {version}, labelled <Badge label="new" />.

<img src="chart.png" alt="A bar chart" />

{/* Hidden from readers. */}
`;

/** An MDX article beside a Markdown file it links to and an image it shows, in a fresh folder. */
function article(text = ARTICLE) {
  const dir = tempHome();
  const file = path.join(dir, 'notes.mdx');
  writeFileSync(file, text);
  writeFileSync(path.join(dir, 'next.md'), '# The next part\n');
  copyFileSync(path.join(pics, 'chart.png'), path.join(dir, 'chart.png'));
  return { dir, file };
}

test('an MDX article shows components as labelled boxes, hides imports and comments, and runs nothing', async () => {
  const { dir, file } = article();
  const { app, window, close } = await launchApp(['--', file]);
  try {
    const document = shownDocument(window);
    await expect(document.locator('h1')).toHaveText('Release notes');
    const callout = document.locator('div[data-galeo-mdx="Callout"]');
    await expect(callout.locator('code[data-galeo-mdx="name"]')).toHaveText('<Callout>');
    await expect(callout.locator('dl[data-galeo-mdx="props"]')).toContainText('type"warning"');
    await expect(callout.locator('strong')).toHaveText('this');
    await expect(document.locator('span[data-galeo-mdx="Badge"]')).toHaveText('<Badge label="new" />');
    await expect(document.locator('code[data-galeo-mdx="expression"]')).toHaveText('{version}');
    const text = await document.locator('article').textContent();
    expect(text).not.toContain('import Callout');
    expect(text).not.toContain('Hidden from readers');
    // The local image loads through main's check, as in Markdown.
    const image = document.getByRole('img', { name: 'A bar chart' });
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
    for (const scheme of ['light', 'dark'] as const) {
      await app.evaluate(({ nativeTheme }, value) => (nativeTheme.themeSource = value), scheme);
      const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]').analyze();
      expect(results.violations, scheme).toEqual([]);
    }
    // A link inside a component is followed like any other.
    await callout.getByRole('link', { name: 'the next part' }).click();
    await expect(document.locator('h1')).toHaveText('The next part');
  } finally {
    await close();
    removeTempHome(dir);
  }
});

test('an MDX syntax error shows the source with the line; fixing and saving it renders again', async () => {
  const { dir, file } = article('# Broken\n\nA stray <3 here.\n');
  const { app, window, close } = await launchApp(['--', file]);
  try {
    const banner = window.locator('[data-banner="syntax-error"]');
    await expect(banner).toContainText('MDX syntax error on line 3');
    await expect(shownDocument(window).locator('.cm-editor')).toBeVisible();

    await pressInMain(app, window, 'E');
    const editor = shownDocument(window).locator('.cm-content');
    await expect(editor).toBeFocused();
    await window.keyboard.press('ControlOrMeta+End');
    await window.keyboard.press('Shift+ArrowUp');
    await window.keyboard.press('Shift+Home');
    await window.keyboard.type('Fixed.\n');
    await window.keyboard.press('ControlOrMeta+s');
    await expect(window.getByTestId('status-message')).toHaveText('Saved');
    expect(readFileSync(file, 'utf8')).toBe('# Broken\n\nFixed.\n');
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Read-only');
    await window.keyboard.press('ControlOrMeta+U');
    await expect(shownDocument(window).locator('p')).toHaveText('Fixed.');
    await expect(banner).toHaveCount(0);
  } finally {
    await close();
    removeTempHome(dir);
  }
});

test('split view previews MDX while typing, and a syntax error pauses the preview with its line', async () => {
  const { dir, file } = article('# Draft\n\n<Note>Hello</Note>\n');
  const { app, window, close } = await launchApp(['--', file]);
  try {
    const document = shownDocument(window);
    await expect(document.locator('[data-galeo-mdx="Note"]')).toContainText('Hello');
    await window.keyboard.press('ControlOrMeta+Backslash');
    await expect(document.locator('.cm-editor')).toBeVisible();
    await pressInMain(app, window, 'E');
    await expect(document.locator('.cm-content')).toBeFocused();
    await window.keyboard.press('ControlOrMeta+End');
    await window.keyboard.type('\n<Tip>Typed</Tip>\n');
    await expect(document.locator('[data-galeo-mdx="Tip"]')).toContainText('Typed');
    await window.keyboard.type('Then a stray <');
    await expect(window.locator('[data-banner="preview-syntax"]')).toContainText('Preview paused: MDX syntax error on line');
    // The last good preview stays.
    await expect(document.locator('[data-galeo-mdx="Tip"]')).toContainText('Typed');
    // Saved, the window closes without asking about unsaved changes.
    await window.keyboard.press('ControlOrMeta+s');
    await expect(window.getByTestId('status-message')).toHaveText('Saved');
  } finally {
    await close();
    removeTempHome(dir);
  }
});
