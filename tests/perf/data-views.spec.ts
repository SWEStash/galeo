import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator } from '@playwright/test';
import { launchApp, tempHome } from '../helpers/launch';
import { checkBudget, summarize, type Summary } from './stats';

const RUNS = 3;
const budgets = (await import('./budgets.json', { with: { type: 'json' } })).default as { jsonTreeOpenMs: number; csvTableOpenMs: number };
const factor = process.env['GALEO_PERF_ENFORCE'] === '1' ? 1 : 3;

/** JSON near the tree's limits (ADR-018): just under 10 MB and 200,000 nodes. */
function bigJson(): string {
  const pad = 'x'.repeat(220);
  return JSON.stringify(Array.from({ length: 39_000 }, (_, i) => ({ id: i, text: pad, ok: true, n: null })));
}

/** A CSV just under the table's default limit (ADR-020): 99 MB, about 1.4 million rows. */
function bigCsv(): string {
  const parts = ['id,name,amount,date,note\n'];
  let size = parts[0]!.length;
  for (let i = 1; size < 99 * 1024 * 1024; i++) {
    const row = `${i},"name ${i}",${(i * 1.37).toFixed(2)},2026-10-${(i % 28) + 1},"a note, with ""quotes"" and padding"\n`;
    parts.push(row);
    size += row.length;
  }
  return parts.join('');
}

/** Frame times while scrolling the view by a screen's third per frame, 150 frames. */
function scrollFrames(view: Locator): Promise<number[]> {
  return view.evaluate(async (element) => {
    const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
    const deltas: number[] = [];
    let last = await frame();
    for (let i = 0; i < 150; i++) {
      element.scrollTop += Math.round(element.clientHeight / 3);
      const now = await frame();
      deltas.push(now - last);
      last = now;
    }
    return deltas;
  });
}

function record(metric: string, open: Summary, frames: Summary, bytes: number) {
  const out = path.join(import.meta.dirname, 'results');
  mkdirSync(out, { recursive: true });
  writeFileSync(
    path.join(out, `${metric}.json`),
    `${JSON.stringify({ metric, measuredAt: new Date().toISOString(), platform: process.platform, ci: Boolean(process.env['CI']), budgetFactor: factor, megabytes: bytes / 1048576, openMs: open, scrollFrameMs: frames }, null, 2)}\n`,
  );
  console.log(`${metric}: open median ${open.median.toFixed(0)} ms (n=${open.n}), scroll median ${frames.median.toFixed(1)} ms, p95 ${frames.p95.toFixed(1)} ms per frame`);
}

for (const [metric, name, make, shown, budget] of [
  ['json-tree-open', 'big.json', bigJson, '[role=treeitem]', 'jsonTreeOpenMs'],
  ['csv-table-open', 'big.csv', bigCsv, '[role=gridcell]', 'csvTableOpenMs'],
] as const) {
  test(`${name} opens in its rich view within the budget and scrolls smoothly`, async () => {
    test.setTimeout(RUNS * 90_000);
    const dir = tempHome();
    const file = path.join(dir, name);
    const text = make();
    writeFileSync(file, text);
    try {
      const opens: number[] = [];
      let frames: number[] = [];
      for (let run = 0; run < RUNS; run++) {
        // From launch to the first row painted: what a reader waits for, cold start included.
        const start = Date.now();
        const { window, close } = await launchApp(['--', file]);
        try {
          const document = window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
          await expect(document.locator(shown).first()).toBeVisible({ timeout: 60_000 });
          await expect(window.locator('[data-banner="too-large"]'), 'the file is under its limit').toHaveCount(0);
          opens.push(Date.now() - start);
          if (run === RUNS - 1) frames = await scrollFrames(document);
        } finally {
          await close();
        }
      }
      const open = summarize(opens);
      const scroll = summarize(frames);
      record(metric, open, scroll, Buffer.byteLength(text));
      const verdict = checkBudget(open, budgets[budget], factor);
      expect(open.median, `open median over the ${verdict.limit} ms limit`).toBeLessThanOrEqual(verdict.limit);
      // Scrolling keeps up with the display: no worse than one dropped frame in two.
      expect(scroll.median, 'scroll frame median').toBeLessThanOrEqual(34);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
