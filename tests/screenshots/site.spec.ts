// The website's screenshots (site/screenshots/), taken from the built app with the documents in
// showcase/. Not part of CI: run `npm run build`, then `npm run headless -- npm run site:screenshots`.
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { pressInMain } from '../helpers/keys';
import { ALL, HEIGHT, palette, shoot as shootTo, shown, showTab, useShowcase, WIDTH, type ShotOptions } from './shoot';

const OUT = path.resolve(import.meta.dirname, '../../site/screenshots');
useShowcase(OUT);

const shoot = (name: string, files: string[], arrange: (window: Page, app: ElectronApplication) => Promise<void>, options?: ShotOptions) =>
  shootTo(OUT, name, files, arrange, options);

for (const theme of ['light', 'dark'] as const) {
  test(`markdown, ${theme}`, async () => {
    await shoot(`markdown-${theme}`, ALL, async (window) => {
      await showTab(window, 'plan.md');
      // Light shows the top of the plan; dark its math, code and diagram.
      if (theme === 'dark') {
        await shown(window).getByRole('heading', { name: 'Ranking' }).evaluate((heading) => heading.scrollIntoView({ block: 'start' }));
        await expect(shown(window).locator('.galeo-diagram-svg svg').first()).toBeVisible();
      }
    }, { theme });
  });
}

test('edit with the split preview', async () => {
  await shoot('split-edit', ALL, async (window, app) => {
    await showTab(window, 'plan.md');
    await pressInMain(app, window, 'E');
    await expect(window.getByTestId('status-mode')).toHaveText('Editing');
    await window.keyboard.press('ControlOrMeta+Backslash');
    await expect(shown(window).getByRole('separator', { name: 'Resize source and preview' })).toBeVisible();
  });
});

test('JSON tree', async () => {
  await shoot('json-tree', ALL, async (window) => {
    await showTab(window, 'results.json');
    await palette(window, 'Expand all nodes');
    // Focus on a node rather than round the whole tree.
    await shown(window).locator('.galeo-json-row', { hasText: 'stages' }).first().click();
  });
});

test('CSV table', async () => {
  await shoot('csv-table', ALL, async (window) => {
    await showTab(window, 'requests.csv');
    await expect(shown(window).getByRole('grid')).toBeVisible();
  });
});

test('log', async () => {
  await shoot('log', ALL, async (window) => {
    await showTab(window, 'search.log');
  }, { theme: 'dark' });
});

test('tabs on the left with the palette', async () => {
  await shoot('tabs-left-palette', ALL, async (window) => {
    await showTab(window, 'plan.md');
    await window.mouse.move(WIDTH - 2, HEIGHT - 2);
    await window.keyboard.press('ControlOrMeta+Shift+P');
    await expect(window.getByTestId('palette')).toBeVisible();
    // The row under the pointer is highlighted: go back to the first.
    await window.keyboard.press('Home');
  }, { theme: 'dark', tabsPosition: 'left' });
});

test('find in all tabs', async () => {
  await shoot('find-all', ALL, async (window) => {
    await window.mouse.move(WIDTH - 2, HEIGHT - 2);
    await window.keyboard.press('ControlOrMeta+Shift+F');
    await window.getByTestId('find-all').getByRole('combobox').fill('p95');
    await expect(window.getByTestId('find-all').getByRole('group').first()).toBeVisible();
  });
});
