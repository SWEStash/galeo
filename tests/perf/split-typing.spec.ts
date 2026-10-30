import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, tempHome } from '../helpers/launch';
import { pressInMain } from '../helpers/keys';
import { checkBudget, summarize } from './stats';

const RUNS = 10;
const budgets = (await import('./budgets.json', { with: { type: 'json' } })).default as { splitTypingMs: number };
const factor = process.env['GALEO_PERF_ENFORCE'] === '1' ? 1 : 3;

const WORDS = 'the writer keeps a draft open while the preview follows each pause in typing and shows how every part of the article will read once it is published'.split(' ');

/** About 110 words of prose, different for each `n`. */
const paragraph = (n: number) => `${Array.from({ length: 110 }, (_, i) => WORDS[(n * 7 + i) % WORDS.length]).join(' ')}.`;

/**
 * A 5,000-word article as a writer checks it in split (PRD release criterion 4): prose under
 * headings, code in each section, tables, display math and three Mermaid diagrams.
 */
function article(): string {
  const parts = ['# A long article', ''];
  for (let section = 1; section <= 10; section++) {
    parts.push(`## Section ${section}`, '');
    for (let n = 0; n < 5; n++) parts.push(paragraph(section * 10 + n), '');
    parts.push('```ts', ...Array.from({ length: 12 }, (_, line) => `const value${line} = compute(${section}, ${line});`), '```', '');
    if (section % 3 === 2) parts.push('```mermaid', 'graph TD', `  A${section}[Draft] --> B${section}{Review}`, `  B${section} --> C${section}[Publish]`, '```', '');
    if (section % 3 === 0) parts.push('| Step | Owner | Days |', '|---|---|---:|', ...Array.from({ length: 6 }, (_, row) => `| Step ${row} | Team ${row} | ${row + 1} |`), '');
    if (section % 4 === 1) parts.push('$$', `\\sum_{i=1}^{${section}} i^2 = \\frac{n(n+1)(2n+1)}{6}`, '$$', '');
  }
  return parts.join('\n');
}

/** Types ` marker` at the end and counts from its last keydown to the frame the preview shows it. */
async function typeAndWait(page: Page, marker: string): Promise<number> {
  await page.evaluate((word) => {
    const state = (globalThis as { __typing?: { lastKey: number; word: string; ms: number | null } }).__typing!;
    state.word = word;
    state.ms = null;
  }, marker);
  await page.keyboard.type(` ${marker}`);
  const handle = await page.waitForFunction(() => (globalThis as { __typing?: { ms: number | null } }).__typing!.ms, null, { timeout: 15_000 });
  return (await handle.jsonValue()) as number;
}

test('typing in a 5,000-word article in split updates the preview within the budget', async () => {
  test.setTimeout(120_000);
  const dir = tempHome();
  const file = path.join(dir, 'article.md');
  writeFileSync(file, article());
  const { app, window, close } = await launchApp(['--', file]);
  try {
    const document = window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
    await expect(document.locator('h1')).toBeVisible();
    await expect(window.getByTestId('status-bar')).toContainText(/[5-9],\d{3} words/);
    await window.keyboard.press('ControlOrMeta+Backslash');
    await expect(document.locator('.cm-editor')).toBeVisible();
    await pressInMain(app, window, 'E');
    await expect(document.locator('.cm-content')).toBeFocused();
    await window.keyboard.press('ControlOrMeta+End');
    await document.evaluate((host) => {
      const state = { lastKey: 0, word: '', ms: null as number | null };
      (globalThis as { __typing?: typeof state }).__typing = state;
      globalThis.addEventListener('keydown', () => (state.lastKey = performance.now()), true);
      const article = host.shadowRoot!.querySelector('article')!;
      new MutationObserver(() => {
        if (state.ms !== null || !state.word || !article.textContent!.includes(state.word)) return;
        requestAnimationFrame(() => (state.ms = performance.now() - state.lastKey));
      }).observe(article, { childList: true, subtree: true });
    });

    await typeAndWait(window, 'warmup');
    const samples: number[] = [];
    for (let run = 0; run < RUNS; run++) samples.push(await typeAndWait(window, `mark${run}x`));

    const summary = summarize(samples);
    const out = path.join(import.meta.dirname, 'results');
    mkdirSync(out, { recursive: true });
    writeFileSync(
      path.join(out, 'split-typing.json'),
      `${JSON.stringify({ metric: 'split-typing', measuredAt: new Date().toISOString(), platform: process.platform, ci: Boolean(process.env['CI']), budgetFactor: factor, ms: summary }, null, 2)}\n`,
    );
    console.log(`split-typing: median ${summary.median.toFixed(1)} ms, p95 ${summary.p95.toFixed(1)} ms (n=${summary.n})`);
    const verdict = checkBudget(summary, budgets.splitTypingMs, factor);
    expect(summary.median, `median over the ${verdict.limit} ms limit`).toBeLessThanOrEqual(verdict.limit);
  } finally {
    // Unsaved typing would ask before closing.
    app.process().kill('SIGKILL');
    await close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
});
