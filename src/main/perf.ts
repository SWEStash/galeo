import { app, type BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';

declare const __GALEO_PERF__: boolean;

const marks: Record<string, number> = {};

/** Records a timing mark (epoch ms). Only builds made with `GALEO_PERF=1` contain the marks. */
export function perfMark(name: string, at = Date.now()): void {
  if (!__GALEO_PERF__) return;
  marks[name] = at;
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

/**
 * For the performance harness: once `window` has painted (and its document, when the launch
 * opened one), writes the marks and the app's memory to the file named by `GALEO_PERF_OUT` and
 * quits. Only `GALEO_PERF=1` builds contain it.
 */
export function reportColdStart(window: BrowserWindow, { document }: { document: boolean }): void {
  if (!__GALEO_PERF__) return;
  const out = process.env['GALEO_PERF_OUT'];
  if (!out) return;
  window.webContents.once('did-finish-load', async () => {
    const firstPaint = (await window.webContents.executeJavaScript(markTime('galeo:first-paint'))) as number;
    const paints: Record<string, number> = { 'first-paint': firstPaint };
    if (document) paints['document-paint'] = (await window.webContents.executeJavaScript(markTime('galeo:document-paint'))) as number;
    const memoryKB = app.getAppMetrics().reduce((sum, metric) => sum + metric.memory.workingSetSize, 0);
    await writeFile(out, JSON.stringify({ marks: { ...marks, ...paints }, memoryKB }));
    app.quit();
  });
}
