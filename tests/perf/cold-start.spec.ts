import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import electronBinary from 'electron';
import { checkBudget, summarize } from './stats';

const RUNS = 10;
const RUN_DEADLINE_MS = 15_000;
const ROOT = path.resolve(import.meta.dirname, '../..');
const budgets = JSON.parse(readFileSync(path.join(import.meta.dirname, 'budgets.json'), 'utf8')) as {
  coldStartToFirstPaintMs: number;
  coldStartToDocumentPaintMs: number;
};
/** The reference document: about 50 KB of an agent-written plan, tables and code included. */
const REFERENCE = path.join(ROOT, 'tests/fixtures/docs/plan-50k.md');
// The strict PRD budgets are the release check (GALEO_PERF_ENFORCE=1, on the owner's machine).
// Otherwise the suite reports, and fails only on a catastrophic regression.
const factor = process.env['GALEO_PERF_ENFORCE'] === '1' ? 1 : 3;

interface Report {
  marks: Record<string, number>;
  memoryKB: number;
}

/**
 * One cold start of the built app, launched directly (a Playwright launch holds back `ready`
 * until it has connected, which would be measured too). The app writes its marks and quits.
 */
async function coldStartOnce(files: string[] = []): Promise<Report> {
  const home = mkdtempSync(path.join(tmpdir(), 'galeo-perf-'));
  const out = path.join(home, 'report.json');
  try {
    const child = spawn(electronBinary as unknown as string, ['.', ...(files.length ? ['--', ...files] : [])], {
      cwd: ROOT,
      stdio: 'ignore',
      env: {
        ...process.env,
        GALEO_PERF_OUT: out,
        XDG_CONFIG_HOME: path.join(home, 'config'),
        XDG_STATE_HOME: path.join(home, 'state'),
        XDG_CACHE_HOME: path.join(home, 'cache'),
      },
    });
    // A run that never reports would stall the suite; stop it and say so.
    const deadline = setTimeout(() => child.kill('SIGKILL'), RUN_DEADLINE_MS);
    const code = await new Promise<number | null>((resolve) => child.once('exit', resolve));
    clearTimeout(deadline);
    let report: Report;
    try {
      report = JSON.parse(readFileSync(out, 'utf8')) as Report;
    } catch {
      throw new Error(
        code === null
          ? `a run did not report within ${RUN_DEADLINE_MS} ms and was stopped`
          : `no perf report (exit ${code}): build with \`GALEO_PERF=1 npm run build\` first`,
      );
    }
    return report;
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

const since = (report: Report, mark: string) => report.marks[mark]! - report.marks['process-start']!;

test('cold start to first paint of the blank window', async () => {
  test.setTimeout(RUNS * 20_000);
  const runs: Report[] = [];
  for (let i = 0; i < RUNS; i++) runs.push(await coldStartOnce());

  const firstPaint = summarize(runs.map((r) => since(r, 'first-paint')));
  const result = {
    metric: 'coldStartToFirstPaint',
    measuredAt: new Date().toISOString(),
    platform: process.platform,
    ci: Boolean(process.env['CI']),
    budgetFactor: factor,
    firstPaintMs: firstPaint,
    appReadyMs: summarize(runs.map((r) => since(r, 'app-ready'))),
    windowCreatedMs: summarize(runs.map((r) => since(r, 'window-created'))),
    memoryMB: summarize(runs.map((r) => r.memoryKB / 1024)),
  };
  const dir = path.join(import.meta.dirname, 'results');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'cold-start.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `cold start → first paint: median ${firstPaint.median.toFixed(0)} ms, p95 ${firstPaint.p95.toFixed(0)} ms ` +
      `(n=${firstPaint.n}); app ready at ${result.appReadyMs.median.toFixed(0)} ms, window created at ` +
      `${result.windowCreatedMs.median.toFixed(0)} ms; ` +
      `memory median ${result.memoryMB.median.toFixed(0)} MB`,
  );

  const verdict = checkBudget(firstPaint, budgets.coldStartToFirstPaintMs, factor);
  expect(firstPaint.median, `median over the ${verdict.limit} ms limit`).toBeLessThanOrEqual(verdict.limit);
});

test('cold start to first paint of the 50 KB reference document', async () => {
  test.setTimeout(RUNS * 20_000);
  const runs: Report[] = [];
  for (let i = 0; i < RUNS; i++) runs.push(await coldStartOnce([REFERENCE]));

  const documentPaint = summarize(runs.map((r) => since(r, 'document-paint')));
  const result = {
    metric: 'coldStartToDocumentPaint',
    measuredAt: new Date().toISOString(),
    platform: process.platform,
    ci: Boolean(process.env['CI']),
    budgetFactor: factor,
    documentPaintMs: documentPaint,
    firstPaintMs: summarize(runs.map((r) => since(r, 'first-paint'))),
    memoryMB: summarize(runs.map((r) => r.memoryKB / 1024)),
  };
  const dir = path.join(import.meta.dirname, 'results');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'cold-start-document.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `cold start → 50 KB document painted: median ${documentPaint.median.toFixed(0)} ms, p95 ` +
      `${documentPaint.p95.toFixed(0)} ms (n=${documentPaint.n}); window painted at ` +
      `${result.firstPaintMs.median.toFixed(0)} ms; memory median ${result.memoryMB.median.toFixed(0)} MB`,
  );

  const verdict = checkBudget(documentPaint, budgets.coldStartToDocumentPaintMs, factor);
  expect(documentPaint.median, `median over the ${verdict.limit} ms limit`).toBeLessThanOrEqual(verdict.limit);
});
