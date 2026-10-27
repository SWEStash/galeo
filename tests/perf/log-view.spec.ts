import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator } from '@playwright/test';
import { launchApp, tempHome } from '../helpers/launch';
import { checkBudget, summarize, type Summary } from './stats';

const budgets = (await import('./budgets.json', { with: { type: 'json' } })).default as { logScrollFrameMs: number; logFollowMs: number };

const factor = process.env['GALEO_PERF_ENFORCE'] === '1' ? 1 : 3;
const LEVELS = ['INFO', 'INFO', 'DEBUG', 'INFO', 'WARN', 'INFO', 'ERROR', 'DEBUG'];

/** One service log line: timestamp, level, logger and logfmt pairs, as the log view meets them. */
function line(n: number): string {
  const second = String(n % 60).padStart(2, '0');
  const minute = String(Math.floor(n / 60) % 60).padStart(2, '0');
  return `2026-10-26T12:${minute}:${second}.${String(n % 1000).padStart(3, '0')}Z ${LEVELS[n % LEVELS.length]} worker-${n % 8} request done method=GET path=/api/items/${n} status=200 duration_ms=${n % 97} user="someone ${n % 13}"\n`;
}

/** A log of about 100 MB: a long-running service's log, well under the read limit. */
function bigLog(): { text: string; lines: number } {
  const parts: string[] = [];
  let size = 0;
  for (let n = 0; size < 100 * 1024 * 1024; n++) {
    const next = line(n);
    parts.push(next);
    size += next.length;
  }
  return { text: parts.join(''), lines: parts.length };
}

/** Frame times while scrolling a page per frame, 50 frames each at the top, the middle and the end. */
function scrollFrames(scroller: Locator): Promise<number[]> {
  return scroller.evaluate(async (element) => {
    const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
    const deltas: number[] = [];
    for (const at of [0, 0.5, 0.98]) {
      element.scrollTop = Math.round((element.scrollHeight - element.clientHeight) * at);
      let last = await frame();
      for (let i = 0; i < 50; i++) {
        element.scrollTop += element.clientHeight;
        const now = await frame();
        deltas.push(now - last);
        last = now;
      }
    }
    return deltas;
  });
}

/** Ms from appending a line to that line being painted, while the log is followed. */
async function followDelay(document: Locator, scroller: Locator, file: string, marker: string): Promise<number> {
  // The scroller is inside the document's shadow root, where the lines are.
  const painted = scroller.evaluate(
    (element, text) =>
      new Promise<number>((resolve) => {
        const check = () => {
          const shown = [...element.querySelectorAll('.cm-line')].some((row) => row.textContent?.includes(text));
          if (shown) resolve(Date.now());
          else requestAnimationFrame(check);
        };
        check();
      }),
    marker,
  );
  const start = Date.now();
  appendFileSync(file, `2026-10-26T13:00:00.000Z INFO follower ${marker} key=value\n`);
  const end = await painted;
  await expect(document).toHaveAttribute('data-follow', 'on');
  return end - start;
}

function record(metric: string, data: Record<string, Summary | number>) {
  const out = path.join(import.meta.dirname, 'results');
  mkdirSync(out, { recursive: true });
  writeFileSync(
    path.join(out, `${metric}.json`),
    `${JSON.stringify({ metric, measuredAt: new Date().toISOString(), platform: process.platform, ci: Boolean(process.env['CI']), budgetFactor: factor, ...data }, null, 2)}\n`,
  );
}

test('a 100 MB log scrolls smoothly and shows appended lines quickly while followed', async () => {
  test.setTimeout(240_000);
  const dir = tempHome();
  const file = path.join(dir, 'service.log');
  const { text, lines } = bigLog();
  writeFileSync(file, text);
  try {
    const { window, close } = await launchApp(['--', file]);
    try {
      const document = window.locator('[data-testid="tab-panel"][data-active="true"] [data-testid="document"]');
      const scroller = document.locator('.cm-scroller');
      await expect(document.locator('.cm-line').first()).toBeVisible({ timeout: 60_000 });
      // The log's own line count: its pane has reported, so it hears keys now.
      await expect(window.getByTestId('status-metrics')).toHaveText(`${(lines + 1).toLocaleString('en-US')} ln`, { timeout: 60_000 });
      await window.keyboard.press('End');
      await expect(document).toHaveAttribute('data-follow', 'on');
      const delays: number[] = [];
      for (let n = 0; n < 7; n++) delays.push(await followDelay(document, scroller, file, `appended-${n}`));
      const follow = summarize(delays);
      // Scrolled last: scroll events still in flight would end following.
      const frames = summarize(await scrollFrames(scroller));

      record('log-view', { megabytes: Buffer.byteLength(text) / 1048576, scrollFrameMs: frames, followMs: follow });
      console.log(
        `log-view: scroll median ${frames.median.toFixed(1)} ms, p95 ${frames.p95.toFixed(1)} ms per frame (n=${frames.n}); follow median ${follow.median.toFixed(0)} ms, p95 ${follow.p95.toFixed(0)} ms (n=${follow.n})`,
      );
      for (const [summary, budget, name] of [
        [frames, budgets.logScrollFrameMs, 'scroll frame median'],
        [follow, budgets.logFollowMs, 'follow median'],
      ] as const) {
        const verdict = checkBudget(summary, budget, factor);
        expect(summary.median, `${name} over the ${verdict.limit} ms limit`).toBeLessThanOrEqual(verdict.limit);
      }
    } finally {
      await close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
