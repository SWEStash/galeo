import { attachDiagrams } from './diagrams';
import { mountDocumentHost } from './host';

/** What a rendered document prints from: the worker's HTML and the image URLs main gave the view. */
export interface Printable {
  html: string;
  /** Each local image's URL by its `data-galeo-src`, as the shown document resolved it. */
  images: ReadonlyMap<string, string>;
}

/** How long the diagrams may take to draw for print before it goes on without the rest. */
const DIAGRAMS_MS = 10_000;

/**
 * Puts a copy of the document in the print-only container (#56): the same HTML and document styles,
 * in the light theme (the container re-declares its tokens), its diagrams drawn light. The print
 * stylesheet shows only this container, so galeo's bars never reach the page. Resolves once it is
 * ready, with the function that takes it away.
 */
export async function preparePrint({ html, images }: Printable, documentRoot: Document = document): Promise<() => void> {
  const container = documentRoot.createElement('div');
  container.className = 'galeo-print';
  container.dataset['scheme'] = 'light';
  documentRoot.body.append(container);
  const host = mountDocumentHost(container);
  host.setContent(html);
  for (const image of host.article.querySelectorAll<HTMLImageElement>('img[data-galeo-src]')) {
    const url = images.get(image.dataset['galeoSrc']!);
    if (url) image.src = url;
    else image.remove();
  }
  const diagrams = attachDiagrams(host.article, { scheme: 'light', observe: (_element, onVisible) => (onVisible(), () => {}) });
  const drawn = () => [...host.article.querySelectorAll<HTMLElement>('.galeo-diagram')].every((each) => each.dataset['state'] === 'rendered' || each.dataset['state'] === 'error');
  const until = Date.now() + DIAGRAMS_MS;
  while (!drawn() && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 50));
  // A wide diagram keeps a minimum width on screen (it scrolls); on paper it shrinks to the page.
  for (const drawing of host.article.querySelectorAll<HTMLElement>('.galeo-diagram-svg')) {
    const svg = drawing.shadowRoot?.querySelector<SVGSVGElement>('svg');
    if (svg) {
      svg.style.removeProperty('min-width');
      svg.style.setProperty('max-width', '100%');
      svg.style.setProperty('height', 'auto');
    }
  }
  await Promise.all([...host.article.querySelectorAll('img')].map((image) => image.decode().catch(() => undefined)));
  return () => {
    diagrams.dispose();
    container.remove();
  };
}
