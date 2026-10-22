import type { Page } from '@playwright/test';

const INLINE_HANDLER = /^Executing inline event handler violates/;

/**
 * Collects the page's CSP refusals (SR-02), which must never happen, from its load on: the window is
 * reloaded once so the watch is in place before anything renders.
 *
 * An inline event handler is judged by where it was found. One that reached the page is refused on
 * its element. Since Chromium 156, parsing one where it can never run (DOMPurify's parse of a hostile
 * label) is reported too, on the document: that one is no refusal. Every other refusal is taken from
 * the console, which also hears the worker.
 */
export async function watchRefusals(window: Page): Promise<() => Promise<string[]>> {
  await window.addInitScript(() => {
    const seen: string[] = [];
    (globalThis as { __galeoRefusals?: string[] }).__galeoRefusals = seen;
    document.addEventListener(
      'securitypolicyviolation',
      (event) => {
        if (event.violatedDirective !== 'script-src-attr' || !(event.target instanceof Element)) return;
        seen.push(`inline event handler on <${event.target.localName}>`);
      },
      true,
    );
  });
  const logged: string[] = [];
  window.on('console', (message) => {
    const text = message.text();
    if (/Refused to|violates the following Content Security Policy/.test(text) && !INLINE_HANDLER.test(text)) logged.push(text);
  });
  await window.reload();
  return async () => [...logged, ...(await window.evaluate(() => (globalThis as { __galeoRefusals?: string[] }).__galeoRefusals ?? ['no watch']))];
}
