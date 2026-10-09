// What must never reach the page from a document (SR-02, SR-03, SR-06): elements that run code,
// load resources or change the page, event handlers, dangerous URLs, and author styles.

const FORBIDDEN_ELEMENTS = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'button',
  'textarea', 'select', 'base', 'meta', 'link', 'svg', 'template', 'noscript', 'portal', 'video',
  'audio', 'source', 'track', 'picture', 'canvas', 'dialog', 'marquee',
]);

const URL_ATTRIBUTES = new Set([
  'href', 'src', 'xlink:href', 'action', 'formaction', 'srcset', 'poster', 'background', 'data',
  'cite', 'longdesc', 'ping', 'manifest', 'icon', 'lowsrc', 'dynsrc',
]);

const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/** Output of the trusted generators, which set their own `style` and `tabindex` (never author content). */
const GENERATED = '.katex, .katex-error, pre.shiki';

function urlProblem(value: string): string | null {
  // Browsers ignore ASCII whitespace and control characters inside a scheme.
  const compact = value.replace(/[\u0000- ]/g, '');
  // Browsers read any two of `/` and `\` as the start of a host.
  if (/^[\\/]{2}/.test(compact)) return 'protocol-relative URL';
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact)?.[1];
  if (scheme && !SAFE_SCHEMES.has(`${scheme.toLowerCase()}:`)) return `scheme ${scheme}`;
  return null;
}

/** Lists everything in `root` that a document must not be able to put on the page. */
export function findViolations(root: ParentNode): string[] {
  const violations: string[] = [];
  for (const element of root.querySelectorAll('*')) {
    const tag = element.localName;
    const inMath = element.closest('.katex') !== null;
    if (FORBIDDEN_ELEMENTS.has(tag)) violations.push(`<${tag}>`);
    if (tag === 'math' && !inMath) violations.push('<math> outside KaTeX');
    if (tag === 'input' && !(element.getAttribute('type') === 'checkbox' && element.hasAttribute('disabled'))) {
      violations.push('<input> other than a disabled checkbox');
    }
    if (tag === 'img' && element.hasAttribute('src')) violations.push('<img src> (images load only through main)');
    for (const { name, value } of element.attributes) {
      const lower = name.toLowerCase();
      if (lower.startsWith('on')) violations.push(`${lower} handler`);
      // A document must not take the app's keyboard shortcuts or trap focus.
      if (lower === 'accesskey' || (lower === 'tabindex' && element.closest(GENERATED) === null)) violations.push(lower);
      if (lower === 'style' && element.closest(GENERATED) === null) violations.push(`style on <${tag}>`);
      if (lower === 'style' && /url\(|expression|position\s*:\s*fixed|@import/i.test(value)) violations.push(`style value ${value}`);
      if ((lower === 'id' || lower === 'name') && !value.startsWith('user-content-')) violations.push(`${lower}="${value}"`);
      if ((lower === 'data-src-line' || lower === 'data-src-end') && !/^[1-9]\d*$/.test(value)) violations.push(`${lower}="${value}"`);
      if (URL_ATTRIBUTES.has(lower)) {
        const problem = urlProblem(value);
        if (problem) violations.push(`${lower}: ${problem}`);
      }
    }
  }
  return violations;
}
