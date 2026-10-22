import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, removeTempHome, tempHome } from '../helpers/launch';
import { dropFiles } from '../helpers/tab-drag';

const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const tabNames = async (window: Page) => (await window.getByRole('tab').allTextContents()).map((text) => text.replace('✕', '').replace(/,.*$/, ''));

async function centreOf(window: Page, selector: string) {
  const box = (await window.locator(selector).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function tree(home: string) {
  const dir = path.join(home, 'drop');
  mkdirSync(path.join(dir, 'plans'), { recursive: true });
  const files = { first: '# First\n', second: '# Second\n', third: '# Third\n', shown: '# Shown\n', other: '# Other\n' };
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, `${name}.md`), text);
  writeFileSync(path.join(dir, 'plans', 'plan.md'), '# Plan\n');
  writeFileSync(path.join(dir, 'image.bin'), Buffer.from([0, 1, 2, 3, 0, 0, 255]));
  return (name: string) => path.join(dir, name);
}

async function withTree(run: (file: (name: string) => string, home: string) => Promise<void>) {
  const home = tempHome();
  try {
    await run(tree(home), home);
  } finally {
    removeTempHome(home);
  }
}

test('files dropped on the document open after the shown tab, in order, the first one shown', async () => {
  await withTree(async (file, home) => {
    const { window, close } = await launchApp(['--', file('shown.md'), file('other.md')], { home });
    try {
      await expect(shownDocument(window).locator('h1')).toHaveText('Shown');
      await dropFiles(window, [file('first.md'), file('second.md'), file('third.md')], await centreOf(window, '[data-testid="app-root"]'));
      await expect(window.getByRole('tab')).toHaveCount(5);
      expect(await tabNames(window)).toEqual(['shown.md', 'first.md', 'second.md', 'third.md', 'other.md']);
      await expect(shownDocument(window).locator('h1')).toHaveText('First');
    } finally {
      await close();
    }
  });
});

test('files dropped before the first tab open at the start of the tab bar', async () => {
  await withTree(async (file, home) => {
    const { window, close } = await launchApp(['--', file('shown.md'), file('other.md')], { home });
    try {
      await expect(shownDocument(window).locator('h1')).toHaveText('Shown');
      const tab = (await window.getByRole('tab').first().boundingBox())!;
      await dropFiles(window, [file('first.md')], { x: tab.x + 4, y: tab.y + tab.height / 2 });
      await expect(window.getByRole('tab')).toHaveCount(3);
      expect(await tabNames(window)).toEqual(['first.md', 'shown.md', 'other.md']);
    } finally {
      await close();
    }
  });
});

test('files dropped on the tab bar open where the caret is: between two tabs, or after the last', async () => {
  await withTree(async (file, home) => {
    const { window, close } = await launchApp(['--', file('shown.md'), file('other.md')], { home });
    try {
      await expect(shownDocument(window).locator('h1')).toHaveText('Shown');
      // Past the middle of the first tab: the caret goes after it.
      const first = (await window.getByRole('tab').first().boundingBox())!;
      await dropFiles(window, [file('first.md')], { x: first.x + first.width - 4, y: first.y + first.height / 2 });
      await expect(window.getByRole('tab')).toHaveCount(3);
      expect(await tabNames(window)).toEqual(['shown.md', 'first.md', 'other.md']);
      const last = (await window.getByRole('tab').last().boundingBox())!;
      await dropFiles(window, [file('second.md')], { x: last.x + last.width - 4, y: last.y + last.height / 2 });
      await expect(window.getByRole('tab')).toHaveCount(4);
      expect(await tabNames(window)).toEqual(['shown.md', 'first.md', 'other.md', 'second.md']);
    } finally {
      await close();
    }
  });
});

test('a dropped folder opens quick open on it; a binary file opens in its can’t-display state', async () => {
  await withTree(async (file, home) => {
    const { window, close } = await launchApp(['--', file('shown.md')], { home });
    try {
      await expect(shownDocument(window).locator('h1')).toHaveText('Shown');
      await dropFiles(window, [file('image.bin')], await centreOf(window, '[data-testid="app-root"]'));
      await expect(window.getByRole('tab', { selected: true })).toContainText('image.bin');
      await expect(window.getByTestId('document-state')).toContainText(/can.t display|binary/i);

      await dropFiles(window, [file('plans')], await centreOf(window, '[data-testid="app-root"]'));
      const quickOpen = window.getByTestId('quick-open');
      await expect(quickOpen).toBeVisible();
      await quickOpen.getByRole('combobox').fill('plan');
      await expect(quickOpen.getByRole('group', { name: /In plans/ }).getByRole('option', { name: /plan\.md/ })).toBeVisible();
      await expect(window.getByRole('tab')).toHaveCount(2);
    } finally {
      await close();
    }
  });
});

test('a drop page script makes up opens nothing, and a dropped file never navigates the window (SR-12)', async () => {
  await withTree(async (file, home) => {
    const { window: page, close } = await launchApp(['--', file('shown.md')], { home });
    try {
      await expect(shownDocument(page).locator('h1')).toHaveText('Shown');
      const url = page.url();
      await page.evaluate(() => {
        const transfer = new DataTransfer();
        transfer.items.add(new File(['# forged'], 'forged.md', { type: 'text/markdown' }));
        const target = document.querySelector('[data-testid="app-root"]')!;
        for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
      });
      // A real drop right after: only it opens, so the forged one was never granted.
      await dropFiles(page, [file('other.md')], await centreOf(page, '[data-testid="app-root"]'));
      await expect(page.getByRole('tab')).toHaveCount(2);
      expect(await tabNames(page)).toEqual(['shown.md', 'other.md']);
      expect(page.url()).toBe(url);
    } finally {
      await close();
    }
  });
});
