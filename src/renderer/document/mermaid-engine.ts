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
  // The fonts too: Mermaid only checks a document's font for balanced braces, and it lands in the style sheet.
  secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'maxEdges', 'htmlLabels', 'themeCSS', 'fontFamily', 'altFontFamily'],
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


/** Drops an attribute that points anywhere but a fragment: `href="#m"` and `url(#m)` stay. */
export function onlyFragments(_node: Element, data: { attrName: string; attrValue: string; keepAttr: boolean }): void {
  const value = data.attrValue.trim();
  if (/href$/i.test(data.attrName) && !value.startsWith('#')) data.keepAttr = false;
  if (fragmentUrlsOnly(value) !== value) data.keepAttr = false;
}

/** The CSS functions that load an image. */
const IMAGE_FUNCTIONS = new Set(['url', 'src', 'image-set', '-webkit-image-set']);
/** A CSS function's name, escapes included (`u\72l`, `\75 rl`), up to its `(`. */
const FUNCTION_NAME = /(?:[\w-]|\\[0-9a-fA-F]{1,6}[ \t\n\r\f]?|\\[^\n\r\f0-9a-fA-F])+(?=\()/g;
const FRAGMENT_URL = /^url\(\s*(['"]?)#[^'")]*\1\s*\)$/i;

/** A CSS name with its escapes decoded, lower case. */
function cssName(raw: string): string {
  return raw.replace(/\\([0-9a-fA-F]{1,6})[ \t\n\r\f]?|\\(.)/g, (_all, hex: string | undefined, char: string) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : char)).toLowerCase();
}

/** Where the `(` at `open` closes, skipping quoted strings; the end when it never does. */
function closingParen(css: string, open: number): number {
  let depth = 0;
  for (let at = open; at < css.length; at++) {
    const char = css[at];
    if (char === '"' || char === "'") {
      const end = css.indexOf(char, at + 1);
      if (end === -1) return css.length - 1;
      at = end;
    } else if (char === '(') depth++;
    else if (char === ')' && --depth === 0) return at;
  }
  return css.length - 1;
}

/**
 * The diagram's `<style>` with every image it would load replaced by `none`, unless it is a plain
 * `url()` to one of the diagram's own fragments: the same rule as `onlyFragments`, whatever reaches
 * the style sheet and however it is written (image sets, `src()`, escaped names).
 */
export function fragmentUrlsOnly(css: string): string {
  let kept = '';
  let at = 0;
  for (const match of css.matchAll(FUNCTION_NAME)) {
    if (match.index < at || !IMAGE_FUNCTIONS.has(cssName(match[0]))) continue;
    const end = closingParen(css, match.index + match[0].length);
    const call = css.slice(match.index, end + 1);
    kept += css.slice(at, match.index) + (FRAGMENT_URL.test(call) ? call : 'none');
    at = end + 1;
  }
  return kept + css.slice(at);
}

function styleUrls(node: Node, data: { tagName: string }): void {
  if (data.tagName === 'style' && node.textContent) node.textContent = fragmentUrlsOnly(node.textContent);
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
    // Mermaid keeps a document's directives until a render ends well: a diagram it refused would
    // otherwise pass them on to every diagram after it, in any tab.
    engine.mermaidAPI.reset();
    engine.initialize({ ...MERMAID_CONFIG, ...(scheme === 'dark' ? { theme: 'dark', themeVariables: DARK_PIE } : { theme: 'default' }) });
    return (await engine.render(`galeo-diagram-${++drawn}`, source)).svg;
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function sanitizeSvg(svg: string): Promise<string> {
  const instance = await (purify ??= import('dompurify').then((module) => module.default));
  // Mermaid shares this instance (a second one would create a second `dompurify` Trusted Types
  // policy), so the hooks are there only while our synchronous pass runs.
  instance.addHook('uponSanitizeAttribute', onlyFragments);
  instance.addHook('uponSanitizeElement', styleUrls);
  try {
    return instance.sanitize(svg, SVG_CONFIG);
  } finally {
    instance.removeHook('uponSanitizeAttribute', onlyFragments);
    instance.removeHook('uponSanitizeElement', styleUrls);
  }
}
