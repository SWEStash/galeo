import type { ColorScheme } from './host';
import { setTrustedHtml } from './host';
import { renderMermaid, sanitizeSvg } from './mermaid-engine';

export interface DiagramOptions {
  scheme: ColorScheme;
  /** Draws a diagram's source as an SVG string; throws with a reader-facing message. */
  render?: (source: string, scheme: ColorScheme) => Promise<string>;
  /** Our own pass over the drawn SVG before it's inserted (SR-03). */
  sanitize?: (svg: string) => string | Promise<string>;
  /** Calls `onVisible` once `element` should be drawn (it nears the view); returns a stop function. */
  observe?: (element: Element, onVisible: () => void) => () => void;
  /** Drawn SVGs by scheme and source. */
  cache?: Map<string, string>;
  /**
   * The reader asked to see a diagram larger. `panel`: it is drawn light on a light panel in dark
   * mode. `returnFocus` focuses its Expand button afterwards, the one there by then (a redraw, e.g.
   * on a scheme change, replaces it).
   */
  onExpand?: (diagram: { svg: string; name: string; panel: boolean; returnFocus: () => void }) => void;
}

export interface Diagrams {
  /** Draws the diagrams again in the new scheme as they come into view. */
  setScheme(scheme: ColorScheme): void;
  /** Stops drawing: the document's content changed or went away. */
  dispose(): void;
}

/**
 * How far a diagram may shrink to fit the column. Mermaid draws labels at about body size and never
 * enlarges a diagram; a wide one would otherwise shrink until its labels can't be read (4.6 px
 * seen), so past this it keeps its size and its block scrolls sideways.
 */
export const MIN_DIAGRAM_SCALE = 0.75;

// `style A fill:#fff`, `classDef x color:red`, `linkStyle 0 stroke:#333`: not `stroke-width`.
const OWN_COLOURS = /^\s*(style|classDef|linkStyle)\b.*\b(fill|color|stroke)\s*:/m;

/**
 * Whether a diagram's source sets its own colours. Its author chose them for a light page, so in
 * dark mode it is drawn with the light theme on a light panel, where they read as intended.
 */
export function setsOwnColours(source: string): boolean {
  return OWN_COLOURS.test(source);
}

/** A window's drawn diagrams, shared by its documents (least recently used dropped first). */
const CACHE = new Map<string, string>();
const CACHE_ENTRIES = 64;

/**
 * A diagram within 200 px of the view draws at once; one within two screens of it draws when the
 * page is idle, so it is usually drawn before it is reached and its drawing (Mermaid lays out on
 * this thread) doesn't land in the middle of a scroll. The margins are the document's scroll
 * container's: the shadow host the article sits in.
 */
function observeVisible(element: Element, onVisible: () => void): () => void {
  const root = (element.getRootNode() as ShadowRoot).host ?? null;
  let idle: number | undefined;
  const stop = () => {
    near.disconnect();
    ahead.disconnect();
    if (idle !== undefined) cancelIdleCallback(idle);
  };
  const draw = () => {
    stop();
    onVisible();
  };
  const near = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && draw(), { root, rootMargin: '200px 0px' });
  const ahead = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) idle ??= requestIdleCallback(draw);
    },
    { root, rootMargin: '200% 0px' },
  );
  near.observe(element);
  ahead.observe(element);
  return stop;
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
  // A diagram wider than the column scrolls sideways: while it does, its scroller takes focus, so
  // the keyboard can scroll it too (WCAG 2.1.1).
  const sized = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const element = target as HTMLElement;
      if (element.scrollWidth > element.clientWidth + 1) element.tabIndex = 0;
      else element.removeAttribute('tabindex');
    }
  });

  /** The scheme a diagram is drawn in: the app's, but light for one that sets its own colours. */
  const drawnIn = (element: HTMLElement, appScheme: ColorScheme): ColorScheme =>
    appScheme === 'dark' && setsOwnColours(sources.get(element)!) ? 'light' : appScheme;
  const keyOf = (element: HTMLElement, appScheme: ColorScheme) => `${drawnIn(element, appScheme)}\n${sources.get(element)}`;

  const unwatch = (element: HTMLElement) => {
    stops.get(element)?.();
    stops.delete(element);
  };

  /**
   * A drawn diagram: a figure named by the diagram's title, holding the drawing (an image of that
   * name, in a scroller of its own) and an Expand button, which stays put while the drawing scrolls.
   */
  const show = (element: HTMLElement, svg: string) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'galeo-diagram-svg';
    const shadow = wrapper.attachShadow({ mode: 'open' });
    setTrustedHtml(shadow, svg);
    const drawn = shadow.querySelector('svg');
    const natural = drawn?.viewBox.baseVal?.width ?? 0;
    if (drawn && natural > 0) drawn.style.minWidth = `${Math.round(natural * MIN_DIAGRAM_SCALE)}px`;
    const name = shadow.querySelector('svg > title')?.textContent?.trim() || 'Diagram';
    wrapper.setAttribute('role', 'img');
    wrapper.setAttribute('aria-label', name);
    const scroller = document.createElement('div');
    scroller.className = 'galeo-diagram-scroll';
    scroller.append(wrapper);
    const expand = document.createElement('button');
    expand.type = 'button';
    expand.className = 'galeo-diagram-expand';
    expand.setAttribute('aria-label', 'Expand diagram');
    expand.title = 'Expand diagram';
    expand.textContent = '⤢';
    const panel = drawnIn(element, scheme) !== scheme;
    const returnFocus = () => element.querySelector<HTMLElement>('.galeo-diagram-expand')?.focus();
    expand.addEventListener('click', () => options.onExpand?.({ svg, name, panel, returnFocus }));
    unobserveScroller(element);
    element.replaceChildren(scroller, expand);
    sized.observe(scroller);
    element.setAttribute('role', 'figure');
    element.setAttribute('aria-label', name);
    if (panel) element.dataset['panel'] = 'light';
    else delete element.dataset['panel'];
    element.dataset['state'] = 'rendered';
  };

  const unobserveScroller = (element: HTMLElement) => {
    const scroller = element.querySelector('.galeo-diagram-scroll');
    if (scroller) sized.unobserve(scroller);
  };

  const fail = (element: HTMLElement, message: string, source: string) => {
    unobserveScroller(element);
    element.replaceChildren(errorBox(message, source));
    element.removeAttribute('role');
    element.removeAttribute('aria-label');
    delete element.dataset['panel'];
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
      if (svg === undefined) svg = await sanitize(await render(source, drawnIn(element, wanted)));
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
      sized.disconnect();
    },
  };
}
