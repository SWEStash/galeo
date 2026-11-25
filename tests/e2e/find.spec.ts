import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { launchApp, removeTempHome, tempHome } from '../helpers/launch';

const plan = path.resolve(import.meta.dirname, '../fixtures/docs/plan-50k.md');

async function openFind(window: Page, query: string) {
  await window.keyboard.press('ControlOrMeta+F');
  const input = window.getByRole('searchbox', { name: 'Find in document' });
  await expect(input).toBeFocused();
  await input.fill(query);
  return input;
}

const status = (window: Page) => window.locator('.find-bar [role="status"]');

/** The rendered highlight registry, from inside the page. */
const highlights = (window: Page) =>
  window.evaluate(() => ({ all: CSS.highlights.get('galeo-find')?.size ?? 0, current: CSS.highlights.get('galeo-find-current')?.size ?? 0 }));

test('finds in the rendered view: counts, steps with Enter and F3, and Esc keeps the place', async () => {
  const { window, close } = await launchApp(['--', plan]);
  try {
    await expect(window.getByTestId('document').locator('h1')).toBeVisible();
    const input = await openFind(window, 'mermaid');
    await expect(status(window)).toHaveText(/^1 of (\d+)$/);
    const total = Number((await status(window).textContent())!.split(' of ')[1]);
    expect(total).toBeGreaterThan(2);
    expect(await highlights(window)).toEqual({ all: total, current: 1 });

    await input.press('Enter');
    await expect(status(window)).toHaveText(`2 of ${total}`);
    await window.keyboard.press('F3');
    await expect(status(window)).toHaveText(`3 of ${total}`);
    await input.press('Shift+Enter');
    await expect(status(window)).toHaveText(`2 of ${total}`);

    const scrolled = await window.getByTestId('document').evaluate((element) => element.scrollTop);
    expect(scrolled).toBeGreaterThan(0);
    await input.press('Escape');
    await expect(window.locator('.find-bar')).toHaveCount(0);
    await expect(window.getByTestId('document')).toBeFocused();
    expect(await window.getByTestId('document').evaluate((element) => element.scrollTop)).toBe(scrolled);
    expect(await highlights(window)).toEqual({ all: 0, current: 0 });
  } finally {
    await close();
  }
});

test("the find bar's close button closes it like Esc (#70)", async () => {
  const { window, close } = await launchApp(['--', plan]);
  try {
    await expect(window.getByTestId('document').locator('h1')).toBeVisible();
    await openFind(window, 'mermaid');
    await expect(status(window)).toHaveText(/^1 of \d+$/);
    await window.getByRole('button', { name: 'Close find (Esc)' }).click();
    await expect(window.locator('.find-bar')).toHaveCount(0);
    await expect(window.getByTestId('document')).toBeFocused();
    expect(await highlights(window)).toEqual({ all: 0, current: 0 });
  } finally {
    await close();
  }
});

test('finds in the source view with the same bar, and matching case narrows it', async () => {
  const { window, close } = await launchApp(['--', plan]);
  try {
    await expect(window.getByTestId('document').locator('h1')).toBeVisible();
    await window.keyboard.press('ControlOrMeta+U');
    await expect(window.getByTestId('document').locator('.cm-editor')).toBeVisible();
    await openFind(window, 'mermaid');
    await expect(status(window)).toHaveText(/^1 of \d+$/);
    const all = Number((await status(window).textContent())!.split(' of ')[1]);
    await expect(window.getByTestId('document').locator('.cm-searchMatch').first()).toBeVisible();
    await window.getByRole('button', { name: 'Match case' }).click();
    await expect(status(window)).toHaveText(/ of \d+$/);
    const cased = Number((await status(window).textContent())!.split(' of ')[1]);
    expect(cased).toBeLessThan(all);
  } finally {
    await close();
  }
});

test('the find bar has no accessibility violations', async () => {
  const { window, close } = await launchApp(['--', plan]);
  try {
    await expect(window.getByTestId('document').locator('h1')).toBeVisible();
    await openFind(window, 'plan');
    // Legacy mode runs in the page itself: Electron can't open the helper page axe uses for frames.
    const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('.find-bar').analyze();
    expect(results.violations).toEqual([]);
  } finally {
    await close();
  }
});

const NEEDLES = '# Notes\n\nA needle one.\n\nSecond paragraph.\n\nThe needle two.\n\nThird needle.\n';

/** Selects in the rendered view, from `from` in the paragraph holding it to the end of `to` in the paragraph holding that. */
function selectRendered(window: Page, from: string, to: string = from, within: string = from) {
  return window.getByTestId('document').evaluate(
    (view, { from, to, within }) => {
      const paragraphs = [...view.shadowRoot!.querySelectorAll('p')];
      const start = paragraphs.find((each) => each.textContent!.includes(within))!.firstChild!;
      const end = paragraphs.find((each) => each.textContent!.includes(to) && (to !== from || each.textContent!.includes(within)))!.firstChild!;
      const at = start.textContent!.indexOf(from);
      document.getSelection()!.setBaseAndExtent(start, at, end, end.textContent!.indexOf(to, start === end ? at : 0) + to.length);
    },
    { from, to, within },
  );
}

test('Ctrl+F with a word selected finds it from there; over several lines it opens empty (#70)', async () => {
  const dir = tempHome();
  const file = path.join(dir, 'notes.md');
  writeFileSync(file, NEEDLES);
  const { window, close } = await launchApp(['--', file]);
  try {
    await expect(window.getByTestId('document').locator('h1')).toHaveText('Notes');
    await selectRendered(window, 'needle', 'needle', 'The needle two');
    await window.keyboard.press('ControlOrMeta+F');
    const input = window.getByRole('searchbox', { name: 'Find in document' });
    await expect(input).toHaveValue('needle');
    await expect(input).toBeFocused();
    await expect(status(window)).toHaveText('2 of 3');
    // With the bar open, a new selection in the document replaces the query.
    await window.getByTestId('document').focus();
    await selectRendered(window, 'Second');
    await window.keyboard.press('ControlOrMeta+F');
    await expect(input).toHaveValue('Second');
    await expect(status(window)).toHaveText('1 of 1');
    await input.press('Escape');
    await selectRendered(window, 'needle one', 'Second paragraph');
    await window.keyboard.press('ControlOrMeta+F');
    await expect(input).toHaveValue('');
  } finally {
    await close();
    removeTempHome(dir);
  }
});

test("Ctrl+F in edit mode starts from the editor's selection (#70)", async () => {
  const dir = tempHome();
  const file = path.join(dir, 'notes.md');
  writeFileSync(file, NEEDLES);
  const { app, window, close } = await launchApp(['--', file]);
  try {
    await expect(window.getByTestId('document').locator('h1')).toHaveText('Notes');
    await pressInMain(app, window, 'E');
    const editor = window.getByTestId('document').locator('.cm-content');
    await expect(editor).toBeFocused();
    await editor.locator('.cm-line', { hasText: 'Third needle.' }).click();
    await window.keyboard.press('End');
    await window.keyboard.press('ArrowLeft');
    for (const _ of 'needle') await window.keyboard.press('Shift+ArrowLeft');
    await window.keyboard.press('ControlOrMeta+F');
    await expect(window.getByRole('searchbox', { name: 'Find in document' })).toHaveValue('needle');
    await expect(status(window)).toHaveText('3 of 3');
  } finally {
    await close();
    removeTempHome(dir);
  }
});
