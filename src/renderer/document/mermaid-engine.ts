import type { Config as PurifyConfig, DOMPurify } from 'dompurify';
import type { Mermaid, MermaidConfig } from 'mermaid';
import type { ColorScheme } from './host';

/**
 * Mermaid in its strict mode with size limits (SR-03): no click callbacks, no HTML labels (so no
 * `foreignObject`), and a document's `%%{init}%%` can't change these settings or inject CSS.
 */
const MERMAID_CONFIG: MermaidConfig = {
  startOnLoad: false,
  securityLevel: 'strict',
  maxTextSize: 50_000,
  // Layout runs on the UI thread at a few ms per edge: 200 edges keep the worst freeze under a second.
  maxEdges: 200,
  htmlLabels: false,
  flowchart: { htmlLabels: false },
  // Flat, like the rest of the app (Mermaid 12's default `neo` look adds shadows); the layout is
  // Mermaid 12's default, ELK.
  look: 'classic',
  suppressErrorRendering: true,
  secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'maxEdges', 'htmlLabels', 'themeCSS'],
};

/**
 * Pie slices for the dark theme. Mermaid's own start near-black (`#0b0000`) and are drawn at 70 %
 * opacity, so some vanish on the page; these are opaque mid-tones that stand out on it, with
 * labels in the page's colour (`--galeo-color-bg`, dark). Mermaid needs literal colours, not tokens.
 */
export const DARK_PIE = {
  pie1: '#4493f8',
  pie2: '#3fb950',
  pie3: '#db6d28',
  pie4: '#ab7df8',
  pie5: '#f85149',
  pie6: '#d29922',
  pie7: '#db61a2',
  pie8: '#39c5cf',
  pie9: '#79c0ff',
  pie10: '#7ee787',
  pie11: '#ffa657',
  pie12: '#d2a8ff',
  pieOpacity: '1',
  pieSectionTextColor: '#0d1117',
  pieStrokeColor: '#0d1117',
  pieOuterStrokeColor: '#0d1117',
};

/**
 * Our own pass over Mermaid's SVG: SVG elements only, no `foreignObject`, scripts or event
 * handlers, and no links (their labels stay). URLs are limited to the diagram's own fragments by
 * `onlyFragments`, not `ALLOWED_URI_REGEXP`: DOMPurify tests that pattern against every attribute
 * value, so it would also strip the geometry (`viewBox`, `d`, `x`, `transform`…).
 */
const SVG_CONFIG: PurifyConfig = {
  USE_PROFILES: { svg: true, svgFilters: true },
  FORBID_TAGS: ['foreignObject', 'script', 'a'],
};

const URL_REFERENCE = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;

/** Drops an attribute that points anywhere but a fragment: `href="#m"` and `url(#m)` stay. */
export function onlyFragments(_node: Element, data: { attrName: string; attrValue: string; keepAttr: boolean }): void {
  const value = data.attrValue.trim();
  if (/href$/i.test(data.attrName) && !value.startsWith('#')) data.keepAttr = false;
  for (const [, , target] of value.matchAll(URL_REFERENCE)) if (!target!.trim().startsWith('#')) data.keepAttr = false;
}

// Both load with the first diagram, never before (they are heavy).
let mermaid: Promise<Mermaid> | undefined;
let purify: Promise<DOMPurify> | undefined;
// Mermaid's configuration is global: one diagram at a time.
let queue: Promise<unknown> = Promise.resolve();
let drawn = 0;

export function renderMermaid(source: string, scheme: ColorScheme): Promise<string> {
  const run = queue.then(async () => {
    const engine = await (mermaid ??= import('mermaid').then((module) => module.default));
    engine.initialize({ ...MERMAID_CONFIG, ...(scheme === 'dark' ? { theme: 'dark', themeVariables: DARK_PIE } : { theme: 'default' }) });
    return (await engine.render(`galeo-diagram-${++drawn}`, source)).svg;
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function sanitizeSvg(svg: string): Promise<string> {
  const instance = await (purify ??= import('dompurify').then((module) => module.default));
  // Mermaid shares this instance (a second one would create a second `dompurify` Trusted Types
  // policy), so the hook is there only while our synchronous pass runs.
  instance.addHook('uponSanitizeAttribute', onlyFragments);
  try {
    return instance.sanitize(svg, SVG_CONFIG);
  } finally {
    instance.removeHook('uponSanitizeAttribute', onlyFragments);
  }
}
