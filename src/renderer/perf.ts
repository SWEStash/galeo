declare const __GALEO_PERF__: boolean;

/**
 * Marks the frame after the current one as painted (`galeo:first-paint` in the page's performance
 * timeline) for the performance harness. Only builds made with `GALEO_PERF=1` contain it.
 */
export function markFirstPaint(): void {
  if (!__GALEO_PERF__) return;
  requestAnimationFrame(() => setTimeout(() => performance.mark('galeo:first-paint')));
}

/** Marks a step of the page's start (`galeo:<name>`) for the performance harness. */
export function markStart(name: 'modules-loaded' | 'info'): void {
  if (!__GALEO_PERF__) return;
  performance.mark(`galeo:${name}`);
}

let documentPainted = false;

/** Marks the frame after the first document content was inserted (`galeo:document-paint`). */
export function markDocumentPaint(): void {
  if (!__GALEO_PERF__ || documentPainted) return;
  documentPainted = true;
  requestAnimationFrame(() => setTimeout(() => performance.mark('galeo:document-paint')));
}
