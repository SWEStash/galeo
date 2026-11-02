import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, launchSecond, removeTempHome, tempHome } from '../helpers/launch';
import { checkBudget, summarize, type Summary } from './stats';

const RUNS = 3;
const MB = 100 * 1024 * 1024;
const budgets = (await import('./budgets.json', { with: { type: 'json' } })).default as { findAllMainDelayMs: number };
const factor = process.env['GALEO_PERF_ENFORCE'] === '1' ? 1 : 3;

/** About 100 MB of log-like lines; every 997th has the needle. */
function bigFile(sample: string, encoding: 'utf8' | 'latin1'): Buffer {
  const parts: string[] = [];
  let size = 0;
  for (let i = 0; size < MB; i++) {
    const line = `${i} 2026-11-02 info request served ${sample} path=/a/b/c status=200${i % 997 === 0 ? ' needle' : ''}\n`;
    parts.push(line);
    size += Buffer.byteLength(line, encoding);
  }
  return Buffer.from(parts.join(''), encoding);
}

/** Main's event-loop delay while `run` runs, in ms. */
async function mainDelay(app: Awaited<ReturnType<typeof launchApp>>['app'], run: () => Promise<void>) {
  await app.evaluate(() => {
    const { monitorEventLoopDelay } = process.getBuiltinModule('node:perf_hooks');
    const histogram = monitorEventLoopDelay({ resolution: 10 });
    histogram.enable();
    (globalThis as Record<string, unknown>)['__findAllDelay'] = histogram;
  });
  await run();
  return app.evaluate(() => {
    const histogram = (globalThis as Record<string, unknown>)['__findAllDelay'] as ReturnType<typeof import('node:perf_hooks').monitorEventLoopDelay>;
    histogram.disable();
    return { maxMs: histogram.max / 1e6, p99Ms: histogram.percentile(99) / 1e6 };
  });
}

/** Window `other` calls main in a loop until `run` ends; the slowest call, in ms. */
async function otherWindowWait(other: Page, run: () => Promise<void>) {
  await other.evaluate(() => {
    const state = { going: true, worst: 0 };
    (window as unknown as Record<string, unknown>)['__findAllProbe'] = state;
    void (async () => {
      while (state.going) {
        const start = performance.now();
        await (window as unknown as { galeo: { settings: { get(): Promise<unknown> } } }).galeo.settings.get();
        state.worst = Math.max(state.worst, performance.now() - start);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    })();
  });
  await run();
  return other.evaluate(() => {
    const state = (window as unknown as Record<string, { going: boolean; worst: number }>)['__findAllProbe']!;
    state.going = false;
    return state.worst;
  });
}

test('find in all tabs over three 100 MB tabs: main stays responsive for other windows', async () => {
  test.setTimeout(10 * 60_000);
  const dir = tempHome();
  const files = {
    'small.md': Buffer.from('# Small\n\nNothing to see.\n'),
    'ascii.txt': bigFile('ok', 'utf8'),
    'multibyte.txt': bigFile('café – naïve ☃ 日本語', 'utf8'),
    'cp1252.txt': bigFile('café naïve', 'latin1'),
  };
  for (const [name, bytes] of Object.entries(files)) writeFileSync(path.join(dir, name), bytes);
  const other = path.join(dir, 'other.md');
  writeFileSync(other, '# Other\n');
  const { app, window, home, close } = await launchApp(['--', ...Object.keys(files).map((name) => path.join(dir, name))]);
  try {
    await expect(window.getByRole('tab')).toHaveCount(4);
    const opened = app.waitForEvent('window');
    launchSecond(home, ['--profile', 'second', '--', other]);
    const second = await opened;
    await expect(second.getByRole('tab')).toHaveCount(1);

    const findAll = window.getByTestId('find-all');
    const query = async () => {
      await window.bringToFront();
      await window.keyboard.press('ControlOrMeta+Shift+F');
      await expect(findAll.getByRole('combobox')).toBeFocused();
      await findAll.getByRole('combobox').fill('needle');
      await expect(findAll.getByTestId('find-all-status')).toHaveText(/matches in 3 tabs/, { timeout: 60_000 });
      await window.keyboard.press('Escape');
      await expect(findAll).toHaveCount(0);
    };
    // The first query fills the system's file cache, as the second one onwards always finds it.
    await query();

    const queryMs: number[] = [];
    const maxMs: number[] = [];
    const p99Ms: number[] = [];
    const otherMs: number[] = [];
    for (let run = 0; run < RUNS; run++) {
      let delay = { maxMs: 0, p99Ms: 0 };
      const worst = await otherWindowWait(second, async () => {
        delay = await mainDelay(app, async () => {
          const start = Date.now();
          await query();
          queryMs.push(Date.now() - start);
        });
      });
      maxMs.push(delay.maxMs);
      p99Ms.push(delay.p99Ms);
      otherMs.push(worst);
    }
    const stall = summarize(maxMs);
    record({ queryMs: summarize(queryMs), mainDelayMaxMs: stall, mainDelayP99Ms: summarize(p99Ms), otherWindowWorstMs: summarize(otherMs) });
    const verdict = checkBudget(stall, budgets.findAllMainDelayMs, factor);
    expect(stall.median, `main's longest stall over the ${verdict.limit} ms limit`).toBeLessThanOrEqual(verdict.limit);
  } finally {
    await close();
    removeTempHome(dir);
  }
});

function record(results: Record<string, Summary>) {
  const out = path.join(import.meta.dirname, 'results');
  mkdirSync(out, { recursive: true });
  writeFileSync(
    path.join(out, 'find-all.json'),
    `${JSON.stringify({ metric: 'find-all-main-delay', measuredAt: new Date().toISOString(), platform: process.platform, ci: Boolean(process.env['CI']), ...results }, null, 2)}\n`,
  );
  console.log(
    `find-all: query median ${results['queryMs']!.median.toFixed(0)} ms, main delay max median ${results['mainDelayMaxMs']!.median.toFixed(0)} ms, other window worst median ${results['otherWindowWorstMs']!.median.toFixed(0)} ms`,
  );
}
