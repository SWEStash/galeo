/** How far into the file the root `<svg>` start tag may end: past a prolog, comments and a doctype. */
const HEAD_BYTES = 16 * 1024;

/** Only SVG files up to this size are read for their size. */
export const SVG_SIZE_MAX_BYTES = 1024 * 1024;

/**
 * The size an SVG's viewBox gives it, for one whose root has no absolute width or height (missing,
 * or a percentage). Chromium gives such an image a default 300×150, so the viewer's 100 % needs this
 * instead (#44). Null when the root has its own size, or there's no usable viewBox. Reads only the
 * root's start tag, from the first bytes; its attributes are ASCII, so no decoder is needed.
 */
export function svgSize(bytes: Uint8Array): { width: number; height: number } | null {
  const head = String.fromCharCode(...bytes.subarray(0, HEAD_BYTES));
  const tag = rootTag(head);
  if (tag === null) return null;
  const attributes = new Map<string, string>();
  for (const [, name, quoted] of tag.matchAll(/([\w:.-]+)\s*=\s*("[^"]*"|'[^']*')/g)) attributes.set(name!, quoted!.slice(1, -1).trim());
  const absolute = (value: string | undefined) => value !== undefined && value !== '' && !value.endsWith('%');
  if (absolute(attributes.get('width')) || absolute(attributes.get('height'))) return null;
  const box = attributes.get('viewBox')?.split(/[\s,]+/).filter(Boolean).map(Number);
  if (box?.length !== 4 || !box.every(Number.isFinite)) return null;
  const [, , width, height] = box as [number, number, number, number];
  return width > 0 && height > 0 ? { width, height } : null;
}

/** The root element's start tag when it is `<svg …>`, after any BOM, prolog, comments and doctype. */
function rootTag(head: string): string | null {
  let at = head.startsWith('ï»¿') ? 3 : 0;
  for (;;) {
    while (at < head.length && /\s/.test(head[at]!)) at++;
    const skip = head.startsWith('<?', at) ? '?>' : head.startsWith('<!--', at) ? '-->' : head.startsWith('<!', at) ? '>' : null;
    if (skip === null) break;
    // A doctype with an internal subset (`[…]`) ends with `]>`.
    const bracket = head.indexOf('[', at);
    const close = skip === '>' && bracket !== -1 && bracket < head.indexOf('>', at) ? ']>' : skip;
    const end = head.indexOf(close, at);
    if (end === -1) return null;
    at = end + close.length;
  }
  if (!/^<svg[\s>/]/.test(head.slice(at, at + 5))) return null;
  // To the `>` that ends the tag, outside quoted values.
  let quote: string | null = null;
  for (let index = at; index < head.length; index++) {
    const char = head[index]!;
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '>') return head.slice(at, index);
  }
  return null;
}
