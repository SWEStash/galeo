import AxeBuilder from '@axe-core/playwright';
import { copyFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { launchApp, removeTempHome, tempHome } from '../helpers/launch';

const docs = path.resolve(import.meta.dirname, '../fixtures/docs');
const four = ['basic.md', 'gfm.md', 'math.md', 'frontmatter.md'].map((name) => path.join(docs, name));

const overview = (window: Page) => window.getByTestId('tab-overview');
const cards = (window: Page) => overview(window).getByRole('row');
const focusedCard = (window: Page) => overview(window).locator('[role="row"]:focus');
const tabNames = (window: Page) => window.getByRole('tab').locator('.tab-label').allTextContents();
const selected = (window: Page) => window.getByRole('tab', { selected: true });
const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');

async function withTabs(run: (window: Page) => Promise<void>) {
  const { window, close } = await launchApp(['--', ...four]);
  try {
    await expect(window.getByRole('tab')).toHaveCount(4);
    await expect(selected(window)).toContainText('basic.md');
    await run(window);
  } finally {
    await close();
  }
}

async function openOverview(window: Page) {
  await window.keyboard.press('ControlOrMeta+Shift+E');
  await expect(focusedCard(window)).toHaveCount(1);
}

test('Ctrl+Shift+E shows every tab as a card, the shown one focused; it passes axe and Esc gives focus back', async () => {
  await withTabs(async (window) => {
    await window.keyboard.press('ControlOrMeta+2');
    await openOverview(window);
    await expect(cards(window)).toHaveCount(4);
    await expect(focusedCard(window)).toContainText('gfm.md');
    await expect(focusedCard(window)).toHaveAttribute('data-active', 'true');
    await expect(cards(window).nth(0)).toContainText('MD');
    await expect(cards(window).nth(0)).toContainText('1 of 4');
    const results = await new AxeBuilder({ page: window }).setLegacyMode(true).include('[data-testid="tab-overview"]').analyze();
    expect(results.violations).toEqual([]);
    await window.keyboard.press('Escape');
    await expect(overview(window)).toHaveCount(0);
    await expect(shownDocument(window)).toBeFocused();
  });
});

test('arrows move between cards and Enter shows that tab; Delete closes one', async () => {
  await withTabs(async (window) => {
    await openOverview(window);
    await window.keyboard.press('ArrowRight');
    await window.keyboard.press('ArrowRight');
    await expect(focusedCard(window)).toContainText('math.md');
    await window.keyboard.press('Delete');
    await expect(cards(window)).toHaveCount(3);
    await expect(window.getByRole('tab')).toHaveCount(3);
    await expect(focusedCard(window)).toContainText('frontmatter.md');
    await window.keyboard.press('End');
    await window.keyboard.press('ArrowLeft');
    await expect(focusedCard(window)).toContainText('gfm.md');
    await window.keyboard.press('Enter');
    await expect(overview(window)).toHaveCount(0);
    await expect(selected(window)).toContainText('gfm.md');
    await expect(shownDocument(window)).toBeFocused();
  });
});

test('Ctrl+Shift+PgDn and a drag move the focused card, and so its tab', async () => {
  await withTabs(async (window) => {
    await openOverview(window);
    await window.keyboard.press('ControlOrMeta+Shift+PageDown');
    await expect.poll(() => tabNames(window)).toEqual(['gfm.md', 'basic.md', 'math.md', 'frontmatter.md']);
    await expect(focusedCard(window)).toContainText('basic.md');
    await expect(selected(window)).toContainText('basic.md');

    const last = cards(window).nth(3);
    const box = (await last.boundingBox())!;
    await cards(window).nth(0).dragTo(last, { targetPosition: { x: box.width * 0.9, y: box.height / 2 } });
    await expect.poll(() => tabNames(window)).toEqual(['basic.md', 'math.md', 'frontmatter.md', 'gfm.md']);
    await expect(cards(window).nth(3)).toContainText('gfm.md');
  });
});

test('the tab bar button and the palette open it too', async () => {
  await withTabs(async (window) => {
    await window.getByTestId('tab-overview-button').click();
    await expect(cards(window)).toHaveCount(4);
    await window.keyboard.press('ControlOrMeta+Shift+E');
    await expect(overview(window)).toHaveCount(0);
    await window.keyboard.press('ControlOrMeta+Shift+P');
    await window.getByTestId('palette').getByRole('combobox').fill('Tab overview');
    await window.keyboard.press('Enter');
    await expect(focusedCard(window)).toContainText('basic.md');
  });
});

test('Delete on a card with unsaved changes asks first; Cancel keeps the tab and its card focused', async () => {
  const dir = tempHome();
  const files = ['notes.md', 'other.md'].map((name) => path.join(dir, name));
  for (const file of files) writeFileSync(file, '# Notes\n');
  const { app, window, close } = await launchApp(['--', ...files]);
  try {
    await expect(window.getByRole('tab')).toHaveCount(2);
    await window.keyboard.press('ControlOrMeta+1');
    await pressInMain(app, window, 'E');
    await expect(shownDocument(window).locator('.cm-content')).toBeFocused();
    await window.keyboard.type('Changed. ');
    await expect(window.locator('.tab-indicator[data-indicator="unsaved changes"]')).toBeAttached();

    await openOverview(window);
    await expect(focusedCard(window)).toContainText('unsaved changes');
    await window.keyboard.press('Delete');
    const dialog = window.getByTestId('unsaved-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(cards(window)).toHaveCount(2);
    await expect(focusedCard(window)).toContainText('notes.md');

    await window.keyboard.press('Delete');
    await dialog.getByRole('button', { name: "Don't save" }).click();
    await expect(cards(window)).toHaveCount(1);
    await expect(focusedCard(window)).toContainText('other.md');
  } finally {
    await close();
    removeTempHome(dir);
  }
});

/** Every scrolled element in the shown panel, shadow roots included: what a moved panel would lose. */
const shownScrolls = (window: Page) =>
  window.locator('[data-testid="tab-panel"][data-active="true"]').evaluate((panel) => {
    const tops: number[] = [];
    const walk = (root: Element | ShadowRoot) => {
      for (const element of root.querySelectorAll('*')) {
        if (element.scrollHeight > element.clientHeight + 10 && getComputedStyle(element).overflowY !== 'visible') tops.push(element.scrollTop);
        if (element.shadowRoot) walk(element.shadowRoot);
      }
    };
    walk(panel);
    return tops;
  });

const scrollShown = (window: Page) =>
  window.locator('[data-testid="tab-panel"][data-active="true"]').evaluate((panel) => {
    const walk = (root: Element | ShadowRoot) => {
      for (const element of root.querySelectorAll('*')) {
        if (element.scrollHeight > element.clientHeight + 10 && getComputedStyle(element).overflowY !== 'visible') element.scrollTop = element.scrollHeight * 0.4;
        if (element.shadowRoot) walk(element.shadowRoot);
      }
    };
    walk(panel);
  });

for (const mode of ['reading', 'editing', 'split'] as const) {
  test(`a tab moved before the shown one leaves the shown document where the reader left it (${mode})`, async () => {
    const home = tempHome();
    const plan = path.join(home, 'plan-50k.md');
    copyFileSync(path.join(docs, 'plan-50k.md'), plan);
    const { app, window, close } = await launchApp(['--', plan, path.join(docs, 'basic.md')], { home });
    try {
      const view = shownDocument(window);
      await expect(view.locator('h2').nth(5)).toBeVisible();
      if (mode === 'split') {
        await window.keyboard.press('ControlOrMeta+Backslash');
        await expect(view.locator('.cm-editor')).toBeVisible();
      }
      if (mode === 'editing') {
        await pressInMain(app, window, 'E');
        await expect(view.locator('.cm-content')).toBeFocused();
      }
      await scrollShown(window);
      const left = await shownScrolls(window);
      expect(left.filter((top) => top > 0)).toHaveLength(mode === 'split' ? 2 : 1);

      await openOverview(window);
      await window.keyboard.press('ArrowRight');
      await expect(focusedCard(window)).toContainText('basic.md');
      await window.keyboard.press('ControlOrMeta+Shift+PageUp');
      await expect.poll(() => tabNames(window)).toEqual(['basic.md', 'plan-50k.md']);
      await window.keyboard.press('Escape');
      await expect(overview(window)).toHaveCount(0);

      await expect(selected(window)).toContainText('plan-50k.md');
      const now = await shownScrolls(window);
      expect(now).toHaveLength(left.length);
      now.forEach((top, index) => expect(Math.abs(top - left[index]!)).toBeLessThanOrEqual(2));
    } finally {
      await close();
      removeTempHome(home);
    }
  });
}
