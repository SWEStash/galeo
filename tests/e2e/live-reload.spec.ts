import { appendFileSync, existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { appDirs, launchApp, removeTempHome, tempHome } from '../helpers/launch';
import { saveFile } from '../helpers/save';

const shownDocument = (window: Page) => window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
const indicator = (window: Page, words: string) => window.locator(`.tab-indicator[data-indicator="${words}"]`);

/** A long Markdown document: sections that each hold enough text to scroll past. */
function sections(from: number, to: number): string {
  let text = '';
  for (let n = from; n <= to; n++) text += `## Section ${n}\n\n${'Words that fill a paragraph of this section. '.repeat(12)}\n\n`;
  return text;
}

/** The text of the first rendered block still visible at the top of the view. */
function topBlock(view: Locator): Promise<string> {
  return view.evaluate((element) => {
    const top = element.getBoundingClientRect().top;
    const blocks = [...element.shadowRoot!.querySelectorAll<HTMLElement>('article [data-src-line]')];
    return blocks.find((block) => block.getBoundingClientRect().bottom > top + 1)?.textContent ?? '';
  });
}

test('a document an agent keeps rewriting updates within 500 ms of the last write, with no scroll jump', async () => {
  const dir = tempHome();
  const file = path.join(dir, 'plan.md');
  writeFileSync(file, `# Plan\n\n${sections(1, 40)}`);
  const { window, close } = await launchApp(['--', file]);
  try {
    const view = shownDocument(window);
    await expect(view.locator('h2').nth(39)).toBeAttached();
    await view.evaluate((element) => {
      const heading = element.shadowRoot!.querySelectorAll('h2')[20]!;
      element.scrollTop = heading.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop;
    });
    const before = await topBlock(view);
    expect(before).toBe('Section 21');

    // Whole-file saves (temp file + rename) and appends, 20 ms apart, as an agent streams a plan.
    // Every whole-file save also grows the first section, above the view.
    let intro = '';
    let text = `# Plan\n\n${sections(1, 40)}`;
    for (let n = 41; n <= 90; n++) {
      if (n % 2) {
        intro += `Added above the reader, save ${n}.\n\n`;
        text = `# Plan\n\n${intro}${sections(1, n)}`;
        saveFile(file, text);
      } else {
        appendFileSync(file, sections(n, n));
        text += sections(n, n);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const lastWrite = Date.now();
    await expect(view.locator('h2').last()).toHaveText('Section 90');
    const appliedAt = Number(await view.getAttribute('data-reloaded-at'));
    expect(appliedAt - lastWrite).toBeLessThan(500);
    expect(await topBlock(view)).toBe(before);
  } finally {
    await close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a changed file shows ↻ on its tab for a moment and says Reloaded; the view it was in stays', async () => {
  const dir = tempHome();
  const file = path.join(dir, 'notes.md');
  writeFileSync(file, '# Notes\n\nfirst\n');
  const { window, close } = await launchApp(['--', file]);
  try {
    const view = shownDocument(window);
    await expect(view.locator('h1')).toHaveText('Notes');
    await window.keyboard.press('Control+U');
    await expect(view).toHaveAttribute('data-view', 'source');
    saveFile(file, '# Notes\n\nsecond\n');
    await expect(indicator(window, 'reloaded from disk')).toBeVisible();
    await expect(window.getByTestId('status-reloaded')).toHaveText('↻ Reloaded');
    await expect(view).toHaveAttribute('data-view', 'source');
    await expect(view.locator('.cm-content')).toContainText('second');
    await expect(indicator(window, 'reloaded from disk')).toHaveCount(0);
    await expect(window.getByTestId('status-reloaded')).toHaveText('');
  } finally {
    await close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('F5 reads the shown file again, keeping its view', async () => {
  const dir = tempHome();
  const file = path.join(dir, 'notes.md');
  writeFileSync(file, '# Notes\n');
  const { window, close } = await launchApp(['--', file]);
  try {
    const view = shownDocument(window);
    await expect(view.locator('h1')).toHaveText('Notes');
    await window.keyboard.press('Control+U');
    await expect(view).toHaveAttribute('data-view', 'source');
    await window.keyboard.press('F5');
    await expect(indicator(window, 'reloaded from disk')).toBeVisible();
    await expect(view).toHaveAttribute('data-view', 'source');
  } finally {
    await close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a followed log scrolls to its new end; a log not followed stays where it is', async () => {
  const dir = tempHome();
  const followed = path.join(dir, 'followed.log');
  const still = path.join(dir, 'still.log');
  const lines = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `INFO line ${from + i}\n`).join('');
  writeFileSync(followed, lines(1, 300));
  writeFileSync(still, lines(1, 300));
  const { window, close } = await launchApp(['--', followed, still]);
  try {
    await expect(shownDocument(window).locator('.cm-content')).toContainText('line 1');
    await window.keyboard.press('End');
    await expect(shownDocument(window)).toHaveAttribute('data-follow', 'on');
    appendFileSync(followed, lines(301, 400));
    await expect(shownDocument(window).locator('.cm-line', { hasText: /^INFO line 400$/ })).toBeInViewport();
    await expect(shownDocument(window)).toHaveAttribute('data-follow', 'on');

    await window.keyboard.press('Control+Tab');
    const stillScroller = shownDocument(window).locator('.cm-scroller');
    await expect(shownDocument(window).locator('.cm-content')).toContainText('line 1');
    await stillScroller.evaluate((element) => (element.scrollTop = 1000));
    const top = await stillScroller.evaluate((element) => element.scrollTop);
    appendFileSync(still, lines(301, 400));
    await expect(shownDocument(window)).toHaveAttribute('data-reloaded-at', /\d+/);
    expect(Math.abs((await stillScroller.evaluate((element) => element.scrollTop)) - top)).toBeLessThanOrEqual(2);
  } finally {
    await close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a file deleted while open shows as missing, and comes back by itself when written again', async () => {
  const home = tempHome();
  const file = path.join(home, 'draft.md');
  writeFileSync(file, '# Draft\n');
  const { window, close } = await launchApp(['--', file], { home });
  try {
    const view = shownDocument(window);
    await expect(view.locator('h1')).toHaveText('Draft');
    unlinkSync(file);
    await expect(indicator(window, 'file missing')).toBeVisible();
    saveFile(file, '# Draft, written again\n');
    await expect(shownDocument(window).locator('h1')).toHaveText('Draft, written again');
    await expect(indicator(window, 'file missing')).toHaveCount(0);
  } finally {
    await close();
    removeTempHome(home);
  }
});

test("a restart brings each tab back in the view it was in, and a followed log still following", async () => {
  const home = tempHome();
  const doc = path.join(home, 'notes.md');
  const log = path.join(home, 'build.log');
  writeFileSync(doc, '# Notes\n');
  writeFileSync(log, 'INFO start\nINFO more\nINFO end');
  try {
    const first = await launchApp(['--', doc, log], { home });
    try {
      const view = shownDocument(first.window);
      await expect(view.locator('h1')).toHaveText('Notes');
      await first.window.keyboard.press('Control+U');
      await expect(view).toHaveAttribute('data-view', 'source');
      await first.window.keyboard.press('Control+Tab');
      await expect(shownDocument(first.window).locator('.cm-content')).toContainText('INFO start');
      // The log's own line count: its pane has reported, so it hears keys now.
      await expect(first.window.getByTestId('status-lines')).toHaveText('3 ln');
      await first.window.keyboard.press('End');
      await expect(shownDocument(first.window)).toHaveAttribute('data-follow', 'on');
      const session = path.join(appDirs(home).state, 'profiles', 'default', 'session.json');
      await expect.poll(() => (existsSync(session) ? readFileSync(session, 'utf8') : ''), { timeout: 15_000 }).toMatch(/"follow": *true/);
    } finally {
      await first.close();
    }

    const second = await launchApp([], { home });
    try {
      await expect(shownDocument(second.window)).toHaveAttribute('data-follow', 'on');
      await second.window.keyboard.press('Control+Tab');
      await expect(shownDocument(second.window)).toHaveAttribute('data-view', 'source');
    } finally {
      await second.close();
    }
  } finally {
    removeTempHome(home);
  }
});
