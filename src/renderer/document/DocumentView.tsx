import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import type { ImageResult } from '../../shared/documents';
import type { ViewMode } from '../../shared/formats';
import { ID_PREFIX } from '../../shared/markdown/ids';
import type { ScrollAnchor } from '../../shared/tabs';
import { markDocumentPaint } from '../perf';
import { anchorAt, blockAtOrBefore, currentHeading, firstVisibleLine, keptTopFor, scrollTopFor, type PlacedBlock } from './anchor';
import { attachDiagrams, type Diagrams } from './diagrams';
import { loadSourceView, mountDocumentHost, sourceViewLoaded, type ColorScheme, type DocumentHost } from './host';
import { createRenderedFinder, type Finder } from './rendered-finder';
import type { SourceLanguage } from './source-view';

/** What the rendered view shows: worker HTML (Markdown) or reader text (`.txt`). */
export type RenderedContent = { html: string } | { text: string };

export interface DocumentViewProps {
  /** The rendered view's content, or null while it isn't needed or ready. */
  rendered: RenderedContent | null;
  source: { text: string; language: SourceLanguage };
  view: ViewMode;
  wrap: boolean;
  /** Logs: keep the source view at the end; `onFollowEnded` fires when the user scrolls up. */
  follow?: boolean;
  onFollowEnded?: () => void;
  scheme: ColorScheme;
  /** Asks main for a local image the document shows; only its answer is ever loaded. */
  onResolveImage?: (src: string) => Promise<ImageResult>;
  /** A link was clicked; main decides what following it does. */
  onLink?: (href: string, options: { background: boolean }) => void;
  /** A right-click: main shows the document's menu (ADR-004); the page shows none of its own. */
  onContextMenu?: (() => void) | undefined;
  /** Where to be once the content is in (a tab waking up); the view stays hidden until it's there. */
  initialPosition?: ScrollAnchor | null;
  /** Where the reader is, once scrolling settles. */
  onPosition?: ((position: ScrollAnchor) => void) | undefined;
  /** How much the shown content weighs (UTF-16 bytes), for the warm-tab budget (ADR-002). */
  onWeight?: ((bytes: number) => void) | undefined;
  /** Content is about to go in: crash recovery's breadcrumb (ADR-002), cleared by `onWeight`. */
  onRendering?: (() => void) | undefined;
  /** Scales the document (per tab), not the app around it. */
  zoom?: number;
  /** A diagram's Expand button: show it in the viewer (`returnFocus` after it closes). */
  onExpandDiagram?: ((diagram: { svg: string; name: string; returnFocus: () => void }) => void) | undefined;
  /** The heading being read in the rendered view (its id), as the reader scrolls; set to follow it. */
  onHeading?: ((id: string | null) => void) | undefined;
  /** Find in whichever view is showing, scroll to anchors, and focus the document area. */
  ref?: Ref<DocumentHandle>;
}

/** Scrolling has settled once it pauses this long; only then is the position reported. */
const POSITION_SETTLE_MS = 300;

/** The rendered blocks in scroll-content coordinates, headings named by their id. */
function placedBlocks(host: DocumentHost, container: HTMLElement): PlacedBlock[] {
  const origin = container.getBoundingClientRect().top - container.scrollTop;
  return [...host.article.querySelectorAll<HTMLElement>('[data-src-line]')].map((element) => {
    const box = element.getBoundingClientRect();
    return {
      line: Number(element.dataset['srcLine']),
      top: box.top - origin,
      bottom: box.bottom - origin,
      heading: /^H[1-6]$/.test(element.tagName) && element.id ? element.id : null,
    };
  });
}

export interface DocumentHandle extends Finder {
  focus(): void;
  /** Scrolls the rendered view to an anchor ('' is the top); false if there's no such place. */
  scrollToAnchor(anchor: string): boolean;
}

/** The source line at the top of the rendered view. */
function renderedTopLine(host: DocumentHost, container: HTMLElement): number {
  const viewportTop = container.getBoundingClientRect().top;
  const blocks = [...host.article.querySelectorAll<HTMLElement>('[data-src-line]')].map((element) => {
    const box = element.getBoundingClientRect();
    return { line: Number(element.dataset['srcLine']), top: box.top, bottom: box.bottom };
  });
  return firstVisibleLine(blocks, viewportTop);
}

function scrollRenderedTo(host: DocumentHost, line: number): void {
  const blocks = [...host.article.querySelectorAll<HTMLElement>('[data-src-line]')];
  const index = blockAtOrBefore(
    blocks.map((element) => Number(element.dataset['srcLine'])),
    line,
  );
  blocks[index]?.scrollIntoView({ block: 'start' });
}

/**
 * A document, rendered outside React (ADR-006): React owns only the container element; the
 * document lives in its shadow root and is updated in place. Switching views keeps the reading
 * position through the blocks' source lines (UX F10).
 */
export function DocumentView({
  rendered,
  source,
  view,
  wrap,
  follow = false,
  onFollowEnded,
  onLink,
  onContextMenu,
  onResolveImage,
  scheme,
  initialPosition = null,
  onPosition,
  onWeight,
  onRendering,
  zoom = 1,
  onHeading,
  onExpandDiagram,
  ref,
}: DocumentViewProps) {
  const container = useRef<HTMLDivElement>(null);
  // A waking tab is inserted hidden, scrolled to its place, then shown: no visible jump (ADR-002).
  const [waking, setWaking] = useState(initialPosition !== null);
  const positionListener = useRef(onPosition);
  positionListener.current = onPosition;
  const linkListener = useRef(onLink);
  linkListener.current = onLink;
  const menuListener = useRef(onContextMenu);
  menuListener.current = onContextMenu;
  const shownView = useRef<ViewMode | null>(null);
  const renderedFinder = useRef<Finder | null>(null);
  const host = () => mountDocumentHost(container.current!);

  useImperativeHandle(ref, () => {
    const inRendered = () => (renderedFinder.current ??= createRenderedFinder(host().article, container.current!));
    const active = (): Finder => {
      const sourceView = host().source;
      if (view === 'source' && sourceView) {
        return { find: sourceView.find, step: sourceView.findStep, clear: sourceView.clearFind };
      }
      return inRendered();
    };
    return {
      find: (query, options) => active().find(query, options),
      step: (direction) => active().step(direction),
      clear: () => {
        inRendered().clear();
        host().source?.clearFind();
      },
      focus: () => container.current?.focus(),
      scrollToAnchor: (anchor) => {
        if (!anchor) {
          container.current!.scrollTop = 0;
          return true;
        }
        // Footnote links name the full id; heading links name the slug, which has the prefix.
        const root = host().root;
        const target = root.getElementById(anchor) ?? root.getElementById(`${ID_PREFIX}${anchor}`);
        target?.scrollIntoView({ block: 'start' });
        return target !== null;
      },
    };
  }, [view]);

  // Links never navigate the page: every click goes to main as the href written in the document.
  useEffect(() => {
    const root = host().root;
    const onClick = (event: Event) => {
      if (!(event instanceof MouseEvent)) return;
      const link = (event.target as Element | null)?.closest('a[href]');
      if (!link) return;
      event.preventDefault();
      if (event.type === 'auxclick' && event.button !== 1) return;
      linkListener.current?.(link.getAttribute('href')!, {
        background: event.ctrlKey || event.metaKey || event.button === 1,
      });
    };
    // On the container, which also hears right-clicks outside the document's own content.
    const element = container.current!;
    const onMenu = (event: Event) => {
      event.preventDefault();
      menuListener.current?.();
    };
    root.addEventListener('click', onClick);
    root.addEventListener('auxclick', onClick);
    element.addEventListener('contextmenu', onMenu);
    return () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('auxclick', onClick);
      element.removeEventListener('contextmenu', onMenu);
    };
  }, []);

  const hasContent = useRef(false);
  const diagrams = useRef<Diagrams | null>(null);
  const expandListener = useRef(onExpandDiagram);
  expandListener.current = onExpandDiagram;
  const shownScheme = useRef(scheme);
  useEffect(() => () => diagrams.current?.dispose(), []);
  useLayoutEffect(() => {
    if (!rendered) return;
    const documentHost = host();
    const element = container.current!;
    // New content for the same file (it changed on disk) keeps the reader where they were,
    // anchored to the block at the top of the view, before anything paints (UX F7).
    const before = hasContent.current && view === 'rendered' && !waking ? placedBlocks(documentHost, element) : null;
    const top = element.scrollTop;
    diagrams.current?.dispose();
    diagrams.current = null;
    onRendering?.();
    if ('html' in rendered) {
      documentHost.setContent(rendered.html);
      // Diagrams drawn before come back at once, before the place is kept below.
      diagrams.current = attachDiagrams(documentHost.article, {
        scheme: shownScheme.current,
        onExpand: (diagram) => expandListener.current?.(diagram),
      });
    } else documentHost.setReaderText(rendered.text);
    if (before) {
      element.scrollTop = keptTopFor(before, top, placedBlocks(documentHost, element), { height: element.scrollHeight, viewport: element.clientHeight });
      element.dataset['reloadedAt'] = String(Date.now());
    }
    hasContent.current = true;
    if (view === 'rendered') markDocumentPaint();
  }, [rendered]);

  // Local images wait for main: the page never names a file to load itself (ADR-004).
  useEffect(() => {
    if (!rendered || !('html' in rendered) || !onResolveImage) return;
    let current = true;
    for (const image of host().article.querySelectorAll<HTMLImageElement>('img[data-galeo-src]')) {
      const src = image.dataset['galeoSrc']!;
      void onResolveImage(src).then((result) => {
        if (!current || !image.isConnected) return;
        if (result.kind === 'image') {
          image.src = result.url;
          return;
        }
        const placeholder = document.createElement('span');
        placeholder.className = 'galeo-image-refused';
        placeholder.textContent = `Image not shown: ${src}`;
        image.replaceWith(placeholder);
      });
    }
    return () => {
      current = false;
    };
  }, [rendered, onResolveImage]);

  // The editor loads the first time a source view shows; until then the rendered view stays.
  const [sourceReady, setSourceReady] = useState(sourceViewLoaded);
  useEffect(() => {
    if (view !== 'source' || sourceReady) return;
    let current = true;
    void loadSourceView().then(() => current && setSourceReady(true));
    return () => {
      current = false;
    };
  }, [view, sourceReady]);

  const shownSource = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!sourceReady || (view !== 'source' && !host().source)) return;
    host().showSource(source.text, source.language, wrap);
    if (shownSource.current !== null && shownSource.current !== source.text) container.current!.dataset['reloadedAt'] = String(Date.now());
    shownSource.current = source.text;
    if (view === 'source') markDocumentPaint();
  }, [source.text, source.language, view, wrap, sourceReady]);

  useLayoutEffect(() => {
    const documentHost = host();
    const previous = shownView.current;
    if (previous === view || (view === 'source' && !sourceReady)) return;
    const line =
      previous === 'rendered'
        ? renderedTopLine(documentHost, container.current!)
        : previous === 'source'
          ? documentHost.source?.topLine()
          : undefined;
    documentHost.showView(view);
    shownView.current = view;
    if (line === undefined) return;
    if (view === 'source') documentHost.source?.scrollToLine(line);
    else scrollRenderedTo(documentHost, line);
  }, [view, sourceReady]);

  useLayoutEffect(() => {
    if (!waking || !initialPosition) return;
    const documentHost = host();
    if (view === 'source' && documentHost.source) {
      documentHost.source.scrollToLine(initialPosition.line);
    } else if (view === 'rendered' && rendered) {
      const element = container.current!;
      element.scrollTop = scrollTopFor(initialPosition, placedBlocks(documentHost, element), {
        height: element.scrollHeight,
        viewport: element.clientHeight,
      });
    } else {
      return;
    }
    setWaking(false);
  }, [waking, initialPosition, view, rendered, source.text, sourceReady]);

  // Report where the reader is once scrolling pauses, from whichever view scrolls. The place is
  // taken at each scroll, while the view is laid out: by the time the report goes, the tab may be
  // hidden, and a hidden view has no layout to measure.
  useEffect(() => {
    const documentHost = host();
    const element = container.current!;
    const scroller = view === 'source' ? documentHost.source?.view.scrollDOM : element;
    if (!scroller) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let latest: ScrollAnchor | null = null;
    const report = () => {
      if (!latest) return;
      // The last reported line, on the element: what tests wait on, and what to look at when a position looks wrong.
      element.dataset['positionLine'] = String(latest.line);
      positionListener.current?.(latest);
    };
    const onScroll = () => {
      const scroll = { top: scroller.scrollTop, height: scroller.scrollHeight, viewport: scroller.clientHeight };
      latest =
        view === 'source'
          ? { ...anchorAt([], scroll), line: documentHost.source!.topLine() }
          : anchorAt(placedBlocks(documentHost, element), scroll);
      clearTimeout(timer);
      timer = setTimeout(report, POSITION_SETTLE_MS);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      report();
      scroller.removeEventListener('scroll', onScroll);
    };
  }, [view, rendered, sourceReady]);

  // The outline follows the reader: the heading at the top of the view, once per frame of scrolling.
  useEffect(() => {
    if (!onHeading || view !== 'rendered' || !rendered) return;
    const element = container.current!;
    const article = host().article;
    let frame = 0;
    const update = () => {
      frame = 0;
      const headings = [...article.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')].map((heading) => ({
        id: heading.id,
        top: heading.getBoundingClientRect().top,
      }));
      onHeading(currentHeading(headings, element.getBoundingClientRect().top));
    };
    const onScroll = () => {
      frame ||= requestAnimationFrame(update);
    };
    update();
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('scroll', onScroll);
    };
  }, [onHeading, view, rendered]);

  useEffect(() => {
    const renderedBytes = rendered ? 2 * ('html' in rendered ? rendered.html.length : rendered.text.length) : 0;
    const sourceBytes = view === 'source' || host().source ? 2 * source.text.length : 0;
    onWeight?.(renderedBytes + sourceBytes);
  }, [rendered, view, source.text, onWeight]);

  useLayoutEffect(() => {
    const sourceView = host().source;
    if (!follow || view !== 'source' || !sourceView) return;
    sourceView.scrollToEnd();
    return sourceView.onScrollUp(() => onFollowEnded?.());
  }, [follow, view, source.text, onFollowEnded, sourceReady]);

  useLayoutEffect(() => {
    host().setScheme(scheme);
    shownScheme.current = scheme;
    diagrams.current?.setScheme(scheme);
  }, [scheme]);

  return (
    <div
      ref={container}
      className="document-view"
      data-testid="document"
      data-follow={follow ? 'on' : 'off'}
      data-waking={waking || undefined}
      style={zoom === 1 ? undefined : { zoom }}
      // The document area takes focus, for keyboard scrolling and for focus after find (UX §7).
      tabIndex={0}
      role="document"
      aria-label="Document"
    />
  );
}
