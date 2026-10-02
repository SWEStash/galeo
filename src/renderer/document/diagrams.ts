import type { ColorScheme } from './host';
import { setTrustedHtml } from './host';
import { renderMermaid, sanitizeSvg } from './mermaid-engine';

export interface DiagramOptions {
  scheme: ColorScheme;
  /** Draws a diagram's source as an SVG string; throws with a reader-facing message. */
  render?: (source: string, scheme: ColorScheme) => Promise<string>;
  /** Our own pass over the drawn SVG before it's inserted (SR-03). */
  sanitize?: (svg: string) => string | Promise<string>;
  /** Calls `onVisible` once `element` is about to scroll into view; returns a stop function. */
  observe?: (element: Element, onVisible: () => void) => () => void;
  /** Drawn SVGs by scheme and source. */
  cache?: Map<string, string>;
}

export interface Diagrams {
  /** Draws the diagrams again in the new scheme as they come into view. */
  setScheme(scheme: ColorScheme): void;
  /** Stops drawing: the document's content changed or went away. */
  dispose(): void;
}

/** A window's drawn diagrams, shared by its documents (least recently used dropped first). */
const CACHE = new Map<string, string>();
const CACHE_ENTRIES = 64;

// Diagrams start drawing a little before they scroll into view.
function observeVisible(element: Element, onVisible: () => void): () => void {
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) onVisible();
  }, { rootMargin: '200px 0px' });
  observer.observe(element);
  return () => observer.disconnect();
}

function remember(cache: Map<string, string>, key: string, svg: string): void {
  cache.delete(key);
  cache.set(key, svg);
  if (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
}

function errorBox(message: string, source: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'galeo-block-error';
  box.setAttribute('role', 'note');
  const text = document.createElement('span');
  text.className = 'galeo-block-error-message';
  text.textContent = message;
  const code = document.createElement('code');
  code.textContent = source;
  box.append(text, code);
  return box;
}

/**
 * Draws the Mermaid placeholders of a rendered document (`.galeo-diagram`, from the worker) as they
 * come into view. Each SVG goes through our sanitizer, then into a shadow root of its own, so
 * the diagram's styles stay inside it; a diagram that can't be drawn shows why, with its source.
 */
export function attachDiagrams(article: HTMLElement, options: DiagramOptions): Diagrams {
  const { render = renderMermaid, sanitize = sanitizeSvg, observe = observeVisible, cache = CACHE } = options;
  let scheme = options.scheme;
  let live = true;
  const sources = new Map<HTMLElement, string>();
  const stops = new Map<HTMLElement, () => void>();

  const keyOf = (element: HTMLElement, forScheme: ColorScheme) => `${forScheme}\n${sources.get(element)}`;

  const unwatch = (element: HTMLElement) => {
    stops.get(element)?.();
    stops.delete(element);
  };

  const show = (element: HTMLElement, svg: string) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'galeo-diagram-svg';
    const shadow = wrapper.attachShadow({ mode: 'open' });
    setTrustedHtml(shadow, svg);
    element.replaceChildren(wrapper);
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', shadow.querySelector('svg > title')?.textContent?.trim() || 'Diagram');
    element.dataset['state'] = 'rendered';
  };

  const fail = (element: HTMLElement, message: string, source: string) => {
    element.replaceChildren(errorBox(message, source));
    element.removeAttribute('role');
    element.removeAttribute('aria-label');
    element.dataset['state'] = 'error';
  };

  const draw = async (element: HTMLElement) => {
    const wanted = scheme;
    const source = sources.get(element)!;
    const key = keyOf(element, wanted);
    // Drawn for a document or scheme that is no longer shown: a newer draw takes over.
    const stale = () => !live || !element.isConnected || wanted !== scheme;
    try {
      let svg = cache.get(key);
      if (svg === undefined) svg = await sanitize(await render(source, wanted));
      remember(cache, key, svg);
      if (!stale()) show(element, svg);
    } catch (error) {
      if (!stale()) fail(element, error instanceof Error && error.message ? error.message : 'This diagram could not be drawn', source);
    }
  };

  const watch = (element: HTMLElement) => {
    unwatch(element);
    const cached = cache.get(keyOf(element, scheme));
    if (cached !== undefined) {
      remember(cache, keyOf(element, scheme), cached);
      return show(element, cached);
    }
    element.dataset['state'] = 'pending';
    stops.set(
      element,
      observe(element, () => {
        unwatch(element);
        void draw(element);
      }),
    );
  };

  for (const element of article.querySelectorAll<HTMLElement>('.galeo-diagram')) {
    sources.set(element, element.querySelector('code')?.textContent ?? '');
    watch(element);
  }

  return {
    setScheme(next) {
      if (next === scheme) return;
      scheme = next;
      for (const element of sources.keys()) if (element.dataset['state'] !== 'error') watch(element);
    },
    dispose() {
      live = false;
      for (const element of [...stops.keys()]) unwatch(element);
    },
  };
}
