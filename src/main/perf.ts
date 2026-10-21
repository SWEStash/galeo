import { app, type BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';

declare const __GALEO_PERF__: boolean;

const marks: Record<string, number> = {};

/**
 * Records a timing mark (epoch ms), the first time only: a cold start measures its first window and
 * profile. Only builds made with `GALEO_PERF=1` contain the marks.
 */
export function perfMark(name: string, at = Date.now()): void {
  if (!__GALEO_PERF__) return;
  marks[name] ??= at;
}

// Resolves with the epoch time of the page's mark `name`, as soon as it exists.
const markTime = (name: string) => `new Promise((resolve) => {
  const done = (entry) => resolve(performance.timeOrigin + entry.startTime);
  const found = performance.getEntriesByName('${name}')[0];
  if (found) return done(found);
  new PerformanceObserver((list, observer) => {
    const entry = list.getEntriesByName('${name}')[0];
    if (entry) { observer.disconnect(); done(entry); }
  }).observe({ type: 'mark', buffered: true });
})`;

// The page's start and its marks so far (epoch ms), read once it has painted.
const PAGE_MARKS = `(() => {
  const at = (name) => performance.getEntriesByName(name)[0];
  const marks = { 'page-start': performance.timeOrigin };
  const page = performance.getEntriesByType('navigation')[0];
  if (page) {
    marks['page-request'] = performance.timeOrigin + page.requestStart;
    marks['page-response'] = performance.timeOrigin + page.responseEnd;
    marks['dom-interactive'] = performance.timeOrigin + page.domInteractive;
  }
  for (const name of ['modules-loaded', 'info']) {
    const entry = at('galeo:' + name);
    if (entry) marks[name] = performance.timeOrigin + entry.startTime;
  }
  return marks;
})()`;

/**
 * For the performance harness: once `window` has painted (and its document, when the launch
 * opened one), writes the marks and the app's memory to the file named by `GALEO_PERF_OUT` and
 * quits. Only `GALEO_PERF=1` builds contain it.
 */
export function reportColdStart(window: BrowserWindow, options: { document: () => boolean }): void {
  if (!__GALEO_PERF__) return;
  const out = process.env['GALEO_PERF_OUT'];
  if (!out) return;
  window.webContents.once('did-finish-load', async () => {
    const firstPaint = (await window.webContents.executeJavaScript(markTime('galeo:first-paint'))) as number;
    const page = (await window.webContents.executeJavaScript(PAGE_MARKS)) as Record<string, number>;
    const paints: Record<string, number> = { ...page, 'first-paint': firstPaint };
    if (options.document()) paints['document-paint'] = (await window.webContents.executeJavaScript(markTime('galeo:document-paint'))) as number;
    const memoryKB = app.getAppMetrics().reduce((sum, metric) => sum + metric.memory.workingSetSize, 0);
    await writeFile(out, JSON.stringify({ marks: { ...marks, ...paints }, memoryKB }));
    app.quit();
  });
}
