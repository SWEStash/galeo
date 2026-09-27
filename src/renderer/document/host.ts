import katexCss from 'katex/dist/katex.min.css?inline';
import type { ViewMode } from '../../shared/formats';
import documentCss from './document.css?inline';
import { createSourceView, type SourceLanguage, type SourceView } from './source-view';
import { textParagraphs } from './text-reader';

export type ColorScheme = 'light' | 'dark';

export interface DocumentHost {
  readonly root: ShadowRoot;
  /** The rendered view's column. */
  readonly article: HTMLElement;
  /** Replaces the rendered content with worker output (already sanitized, ADR-003). */
  setContent(html: string): void;
  /** Shows plain text in the reading column (the `.txt` reader), as text nodes only. */
  setReaderText(text: string): void;
  /** The source view, created on first use and updated in place afterwards. */
  showSource(text: string, language: SourceLanguage, wrap: boolean): SourceView;
  readonly source: SourceView | null;
  /** Shows one view; the other stays mounted (hidden) so switching back is instant. */
  showView(view: ViewMode): void;
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
  const sourceParent = document.createElement('div');
  sourceParent.className = 'galeo-source';
  sourceParent.hidden = true;
  root.append(article, sourceParent);
  let source: SourceView | null = null;
  let sourceText: string | null = null;

  const host: DocumentHost = {
    root,
    article,
    get source() {
      return source;
    },
    setContent(html) {
      article.classList.remove('galeo-text-reader');
      article.innerHTML = (policy ? policy.createHTML(html) : html) as string;
    },
    setReaderText(text) {
      article.classList.add('galeo-text-reader');
      article.replaceChildren(
        ...textParagraphs(text).map(({ line, text: paragraph }) => {
          const element = document.createElement('p');
          element.dataset['srcLine'] = String(line);
          element.textContent = paragraph;
          return element;
        }),
      );
    },
    showSource(text, language, wrap) {
      if (!source) {
        source = createSourceView({ root, parent: sourceParent, text, language, wrap });
      } else {
        if (text !== sourceText) source.setText(text);
        source.setWrap(wrap);
      }
      sourceText = text;
      return source;
    },
    showView(view) {
      article.hidden = view !== 'rendered';
      sourceParent.hidden = view !== 'source';
      container.dataset['view'] = view;
    },
    setScheme(scheme) {
      container.dataset['scheme'] = scheme;
    },
  };
  hosts.set(container, host);
  return host;
}
