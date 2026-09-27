import katexCss from 'katex/dist/katex.min.css?inline';
import documentCss from './document.css?inline';

export type ColorScheme = 'light' | 'dark';

export interface DocumentHost {
  readonly root: ShadowRoot;
  /** Replaces the document content with worker output (already sanitized, ADR-003). */
  setContent(html: string): void;
  /** Picks the code theme matching the app's scheme. */
  setScheme(scheme: ColorScheme): void;
}

// The only way HTML reaches a document (SR-02). The worker's pipeline sanitized it; under
// Trusted Types, anything else inserting HTML into the page is refused.
const policy = (globalThis as { trustedTypes?: TrustedTypePolicyFactory }).trustedTypes?.createPolicy('galeo-document', {
  createHTML: (html: string) => html,
});

let sharedSheets: CSSStyleSheet[] | undefined;

/** Constructable sheets shared by every document: KaTeX's layout, then the document theme. */
function documentSheets(): CSSStyleSheet[] {
  return (sharedSheets ??= [katexCss, documentCss].map((css) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    return sheet;
  }));
}

const hosts = new WeakMap<HTMLElement, DocumentHost>();

/**
 * Gives `container` a shadow root holding one document. Mounting the same container again
 * returns the existing host, so React StrictMode's double effects never duplicate a document.
 */
export function mountDocumentHost(container: HTMLElement): DocumentHost {
  const existing = hosts.get(container);
  if (existing) return existing;
  const root = container.attachShadow({ mode: 'open' });
  root.adoptedStyleSheets = documentSheets();
  const article = document.createElement('article');
  article.className = 'galeo-document';
  root.append(article);
  const host: DocumentHost = {
    root,
    setContent(html) {
      article.innerHTML = (policy ? policy.createHTML(html) : html) as string;
    },
    setScheme(scheme) {
      container.dataset['scheme'] = scheme;
    },
  };
  hosts.set(container, host);
  return host;
}
