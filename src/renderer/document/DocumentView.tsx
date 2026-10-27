import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { useLatest } from './useLatest';
import type { ImageResult } from '../../shared/documents';
import { offerZoom, type ImageExpand } from './images';
import type { ViewMode } from '../../shared/formats';
import { ID_PREFIX } from '../../shared/markdown/ids';
import type { CsvTable } from '../../shared/csv';
import type { TreeModel } from './json-tree-model';
import type { JsonTreeView } from './json-tree-view';
import type { ScrollAnchor } from '../../shared/tabs';
import { markDocumentPaint } from '../perf';
import type { OutlineEntry } from '../worker/pipeline/render';
import { anchorAt, blockAtOrBefore, currentHeading, firstVisibleLine, keptTopFor, scrollTopFor, type PlacedBlock } from './anchor';
import { attachDiagrams, type Diagrams } from './diagrams';
import { loadSourceView, mountDocumentHost, placesFractions, sourceViewLoaded, type ColorScheme, type DocumentHost } from './host';
import { createRenderedFinder, type Finder } from './rendered-finder';
import { lineAtOffset, offsetOfLine, syncScrolling, type ScrollSync, type SyncBlock, type SyncPane } from './scroll-sync';
import type { SourceLanguage } from './source-view';
import { SPLIT_MIN_WIDTH } from './view-modes';
import { NO_MATCHES, type FindResult } from '../../shared/find';
import type { DiagramExpand, FindRequest } from './requests';
import { blockElements, measureBlocks, onFrameScroll } from './blocks';
import { contentWeight } from './content-weight';

/** What the rendered view shows: worker HTML (Markdown), reader text (`.txt`), or a JSON tree or a CSV table (of `source`) named `label`. */
export type RenderedContent = { html: string } | { text: string } | { tree: TreeModel; label: string } | { table: CsvTable; source: string; label: string; header: boolean };

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
  onExpandDiagram?: ((diagram: DiagramExpand) => void) | undefined;
  /** An image's Expand button or a click on it: show it in the viewer. */
  onExpandImage?: ((image: ImageExpand) => void) | undefined;
  /** Edit mode (ADR-013): the source view takes the reader's typing, and focus when it starts. */
  editable?: boolean;
  /** The reader changed the source text (never for new text from the file). */
  onEdit?: (() => void) | undefined;
  /** Find and replace is open: find searches the source, the only text replace can change. */
  replacing?: boolean;
  /** The heading being read (its id), as the reader scrolls; set to follow it. In the source view, the id of an `onSourceOutline` entry. */
  onHeading?: ((id: string | null) => void) | undefined;
  /** The source view's own outline (YAML, TOML), as the text changes; set to have it. */
  onSourceOutline?: ((entries: OutlineEntry[]) => void) | undefined;
  /** Where to put the source view's cursor (invalid JSON's error), once it shows; a new object moves it again. */
  sourceCursor?: { line: number; column: number } | null;
  /** The source pane's share of the width in split (ADR-014). */
  splitRatio?: number;
  /** The reader moved the split's divider. */
  onSplitRatio?: ((ratio: number) => void) | undefined;
  /** The document area became too narrow for a split, or wide enough again. */
  onNarrow?: ((narrow: boolean) => void) | undefined;
  /** A find to run once the view showing can search (a match chosen in find in all tabs); a new token runs it again. */
  pendingFind?: FindRequest | null;
  /** Where `pendingFind` landed. */
  onPendingFind?: ((result: FindResult) => void) | undefined;
  /** Find in whichever view is showing, scroll to anchors, and focus the document area. */
  ref?: Ref<DocumentHandle>;
}


/** Scrolling has settled once it pauses this long; only then is the position reported. */
const POSITION_SETTLE_MS = 300;

const showsRendered = (view: ViewMode | null) => view === 'rendered' || view === 'split';
const showsSource = (view: ViewMode | null) => view === 'source' || view === 'split';

/** The rendered blocks in scroll-content coordinates, headings named by their id. */
function placedBlocks(host: DocumentHost, scroller: HTMLElement): PlacedBlock[] {
  const origin = scroller.getBoundingClientRect().top - scroller.scrollTop;
  return measureBlocks(host.article, origin).map(({ element, line, top, bottom }) => ({
    line,
    top,
    bottom,
    heading: /^H[1-6]$/.test(element.tagName) && element.id ? element.id : null,
  }));
}

/** The rendered blocks with both their source lines, in the rendered scroller's content coordinates. */
function syncBlocks(host: DocumentHost): SyncBlock[] {
  const scroller = host.renderedScroller;
  const origin = scroller.getBoundingClientRect().top - scroller.scrollTop;
  // A block not laid out has no place to sync to.
  return measureBlocks(host.article, origin).flatMap(({ line, end, top, bottom, laidOut }) => (laidOut ? [{ line, end, top, bottom }] : []));
}

export interface DocumentHandle extends Finder {
  focus(): void;
  /** Scrolls the rendered view to an anchor ('' is the top); false if there's no such place. */
  scrollToAnchor(anchor: string): boolean;
  /** Scrolls the source view to a line. */
  scrollToLine(line: number): void;
  /** The source view's text with the reader's edits, or null before it exists. */
  sourceText(): string | null;
  /** Puts the file's text back in the source view, dropping the reader's edits. */
  replaceSource(text: string): void;
  /** Edit mode: replaces the current find match in the source and moves to the next. */
  replace(text: string): FindResult;
  /** Edit mode: replaces every find match in the source; how many it replaced. */
  replaceAll(text: string): number;
  /** The JSON tree shown, or null. */
  tree(): JsonTreeView | null;
}

/** The source line at the top of the rendered view. */
function renderedTopLine(host: DocumentHost): number {
  // A tree or a table draws only the rows in view: it knows its own place.
  if (host.placed) return host.placed.topLine();
  const viewportTop = host.renderedScroller.getBoundingClientRect().top;
  return firstVisibleLine(measureBlocks(host.article, 0), viewportTop);
}

function scrollRenderedTo(host: DocumentHost, line: number): void {
  if (host.placed) return host.placed.scrollToLine(line);
  const blocks = blockElements(host.article);
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
  onSourceOutline,
  onExpandDiagram,
  onExpandImage,
  editable = false,
  onEdit,
  replacing = false,
  sourceCursor = null,
  splitRatio = 0.5,
  onSplitRatio,
  onNarrow,
  pendingFind = null,
  onPendingFind,
  ref,
}: DocumentViewProps) {
  const container = useRef<HTMLDivElement>(null);
  // A waking tab is inserted hidden, scrolled to its place, then shown: no visible jump (ADR-002).
  const [waking, setWaking] = useState(initialPosition !== null);
  const positionListener = useLatest(onPosition);
  const linkListener = useLatest(onLink);
  const menuListener = useLatest(onContextMenu);
  const shownView = useRef<ViewMode | null>(null);
  const editing = useLatest(editable);
  const renderedFinder = useRef<Finder | null>(null);
  // The split pane the reader last turned to: find searches it, else the source (ADR-014).
  const turnedTo = useRef<'source' | 'rendered'>('source');
  const host = () => mountDocumentHost(container.current!);
  const sync = useRef<{ controller: ScrollSync; rendered: SyncPane } | null>(null);

  const inRendered = () => (renderedFinder.current ??= createRenderedFinder(host().article, () => host().renderedScroller));
  /** The finder for the view showing. */
  const active = (): Finder => {
    const sourceView = host().source;
    // A tree or a table draws only the rows in view: the source holds all its text.
    if ((view === 'source' || (view === 'split' && (replacing || turnedTo.current === 'source' || host().placed))) && sourceView) {
      return { find: sourceView.find, step: sourceView.findStep, clear: sourceView.clearFind };
    }
    return inRendered();
  };

  useImperativeHandle(ref, () => {
    return {
      find: (query, options) => active().find(query, options),
      step: (direction) => active().step(direction),
      clear: () => {
        inRendered().clear();
        host().source?.clearFind();
      },
      // In edit mode the caret goes back into the editor; otherwise the document takes focus.
      focus: () => {
        const source = host().source;
        const placed = host().placed;
        if (editing.current && source && showsSource(shownView.current)) source.view.focus();
        else if (placed && shownView.current === 'rendered') placed.focus();
        else container.current?.focus();
      },
      sourceText: () => host().source?.text() ?? null,
      replaceSource: (text) => host().source?.setText(text),
      scrollToLine: (line) => host().source?.scrollToLine(line),
      replace: (text) => host().source?.replace(text) ?? NO_MATCHES,
      replaceAll: (text) => host().source?.replaceAll(text) ?? 0,
      tree: () => host().tree,
      scrollToAnchor: (anchor) => {
        if (!anchor) {
          host().renderedScroller.scrollTop = 0;
          return true;
        }
        // Footnote links name the full id; heading links name the slug, which has the prefix.
        const root = host().root;
        const target = root.getElementById(anchor) ?? root.getElementById(`${ID_PREFIX}${anchor}`);
        target?.scrollIntoView({ block: 'start' });
        return target !== null;
      },
    };
  }, [view, replacing]);

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
    const onTurn = (event: Event) => {
      turnedTo.current = event.composedPath().includes(host().article) ? 'rendered' : 'source';
    };
    root.addEventListener('click', onClick);
    root.addEventListener('auxclick', onClick);
    root.addEventListener('pointerdown', onTurn);
    root.addEventListener('focusin', onTurn);
    element.addEventListener('contextmenu', onMenu);
    return () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('auxclick', onClick);
      root.removeEventListener('pointerdown', onTurn);
      root.removeEventListener('focusin', onTurn);
      element.removeEventListener('contextmenu', onMenu);
    };
  }, []);

  const hasContent = useRef(false);
  const diagrams = useRef<Diagrams | null>(null);
  const expandListener = useLatest(onExpandDiagram);
  const imageListener = useLatest(onExpandImage);
  const shownScheme = useRef(scheme);
  useEffect(() => () => diagrams.current?.dispose(), []);
  useLayoutEffect(() => {
    if (!rendered) return;
    const documentHost = host();
    const element = documentHost.renderedScroller;
    // New content for the same file (it changed on disk) keeps the reader where they were,
    // anchored to the block at the top of the view, before anything paints (UX F7).
    // A tree or a table keeps its place itself.
    const before = hasContent.current && showsRendered(view) && !waking && !('tree' in rendered) && !('table' in rendered) && !documentHost.placed ? placedBlocks(documentHost, element) : null;
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
    } else if ('tree' in rendered) documentHost.setTree(rendered.tree, rendered.label);
    else if ('table' in rendered) documentHost.setTable(rendered.source, rendered.table, rendered.label, { header: rendered.header });
    else documentHost.setReaderText(rendered.text);
    if (before) {
      element.scrollTop = keptTopFor(before, top, placedBlocks(documentHost, element), { height: element.scrollHeight, viewport: element.clientHeight });
      element.dataset['reloadedAt'] = String(Date.now());
    }
    hasContent.current = true;
    // A new preview keeps following the pane the reader leads with, not its own adjustment above.
    if (sync.current) sync.current.controller.refresh(sync.current.rendered);
    if (showsRendered(view)) markDocumentPaint();
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
          // Larger than an icon, it can open in the viewer once its size is known.
          image.addEventListener('load', () => offerZoom(image, (expand) => imageListener.current?.(expand)), { once: true });
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
    if (!showsSource(view) || sourceReady) return;
    let current = true;
    void loadSourceView().then(() => current && setSourceReady(true));
    return () => {
      current = false;
    };
  }, [view, sourceReady]);

  const shownSource = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!sourceReady || (!showsSource(view) && !host().source)) return;
    host().showSource(source.text, source.language, wrap);
    if (shownSource.current !== null && shownSource.current !== source.text) container.current!.dataset['reloadedAt'] = String(Date.now());
    shownSource.current = source.text;
    if (view === 'source') markDocumentPaint();
  }, [source.text, source.language, view, wrap, sourceReady]);

  useLayoutEffect(() => {
    const documentHost = host();
    const previous = shownView.current;
    if (previous === view || (showsSource(view) && !sourceReady)) return;
    const line = showsRendered(previous) ? renderedTopLine(documentHost) : previous === 'source' ? documentHost.source?.topLine() : undefined;
    documentHost.showView(view);
    shownView.current = view;
    if (line === undefined) return;
    // Each pane shown comes in at the reader's place; the rendered one may now scroll elsewhere.
    if (showsSource(view) && previous !== 'source') documentHost.source?.scrollToLine(line);
    if (showsRendered(view)) scrollRenderedTo(documentHost, line);
  }, [view, sourceReady]);

  useLayoutEffect(() => {
    const sourceView = host().source;
    if (!sourceCursor || !sourceReady || !sourceView || !showsSource(view)) return;
    sourceView.select(sourceCursor.line, sourceCursor.column);
  }, [sourceCursor, sourceReady, view]);

  useLayoutEffect(() => {
    host().setSplitRatio(splitRatio);
  }, [splitRatio]);
  const ratioListener = useLatest(onSplitRatio);
  useEffect(() => host().onSplitRatio((ratio) => ratioListener.current?.(ratio)), []);

  // Split keeps both panes on the same block, whichever the reader scrolls (ADR-014). Listening
  // from before the split paints: a scroll in between would be missed, and the panes' first
  // alignment would then take it back.
  useLayoutEffect(() => {
    const documentHost = host();
    const sourceView = documentHost.source;
    if (view !== 'split' || !sourceReady || !sourceView) return;
    const scroller = documentHost.renderedScroller;
    // A table has no blocks to measure: it places fractional lines itself (asked each time, as it
    // may arrive after the split shows).
    const placed = () => (placesFractions(documentHost.placed) ? documentHost.placed : null);
    const rendered: SyncPane = {
      scroller,
      position: () => placed()?.topPosition() ?? lineAtOffset(syncBlocks(documentHost), scroller.scrollTop),
      scrollTo: (line) => {
        const table = placed();
        if (table) table.scrollToPosition(line);
        else scroller.scrollTop = offsetOfLine(syncBlocks(documentHost), line);
      },
    };
    const controller = syncScrolling({ source: { scroller: sourceView.view.scrollDOM, position: sourceView.topPosition, scrollTo: sourceView.scrollToPosition }, rendered });
    sync.current = { controller, rendered };
    return () => {
      controller.stop();
      sync.current = null;
    };
  }, [view, sourceReady]);

  // Whether a split fits: measured as the document area resizes; a hidden tab (no width) keeps its say.
  const narrowListener = useLatest(onNarrow);
  useEffect(() => {
    const element = container.current!;
    let narrow: boolean | null = null;
    const observer = new ResizeObserver(() => {
      const width = element.getBoundingClientRect().width;
      if (width === 0 || (width < SPLIT_MIN_WIDTH) === narrow) return;
      narrow = width < SPLIT_MIN_WIDTH;
      narrowListener.current?.(narrow);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // After the view switch above (a hidden view can't take focus): edit mode makes the source view
  // editable and puts the caret in it; reading makes it read-only again.
  const editListener = useLatest(onEdit);
  useLayoutEffect(() => {
    const sourceView = host().source;
    if (!sourceReady || !sourceView) return;
    sourceView.setEditable(editable);
    if (editable && showsSource(view)) sourceView.view.focus();
  }, [editable, sourceReady, view]);
  useEffect(() => {
    const sourceView = host().source;
    if (!sourceReady || !sourceView) return;
    return sourceView.onEdit(() => editListener.current?.());
  }, [sourceReady, view]);

  useLayoutEffect(() => {
    if (!waking || !initialPosition) return;
    const documentHost = host();
    if (view === 'source' && documentHost.source) {
      documentHost.source.scrollToLine(initialPosition.line);
    } else if (showsRendered(view) && rendered && documentHost.placed) {
      documentHost.placed.scrollToLine(initialPosition.line);
    } else if (showsRendered(view) && rendered && (view === 'rendered' || documentHost.source)) {
      const element = documentHost.renderedScroller;
      element.scrollTop = scrollTopFor(initialPosition, placedBlocks(documentHost, element), {
        height: element.scrollHeight,
        viewport: element.clientHeight,
      });
      documentHost.source?.scrollToLine(initialPosition.line);
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
    // In split the rendered pane reports: scroll sync keeps the source on the same block.
    const scroller = view === 'source' ? documentHost.source?.view.scrollDOM : documentHost.renderedScroller;
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
        view === 'source' && documentHost.source
          ? { ...anchorAt([], scroll), line: documentHost.source.topLine() }
          : documentHost.placed
            ? { ...anchorAt([], scroll), line: documentHost.placed.topLine() }
            : anchorAt(placedBlocks(documentHost, scroller), scroll);
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
    if (!onHeading || !showsRendered(view) || !rendered) return;
    const element = host().renderedScroller;
    const article = host().article;
    const update = () => {
      const headings = [...article.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')].map((heading) => ({
        id: heading.id,
        top: heading.getBoundingClientRect().top,
      }));
      onHeading(currentHeading(headings, element.getBoundingClientRect().top));
    };
    update();
    return onFrameScroll(element, update);
  }, [onHeading, view, rendered]);

  // The source view's outline (YAML, TOML) and the entry at the top of the view, as the reader scrolls or edits.
  useEffect(() => {
    const source = host().source;
    if (!onSourceOutline || view !== 'source' || !sourceReady || !source) return;
    let entries: OutlineEntry[] = [];
    const update = () => {
      const top = source.topLine();
      // As for headings: the last entry at or above the top; the first before any is reached.
      onHeading?.((entries.findLast((entry) => entry.line <= top) ?? entries[0])?.id ?? null);
    };
    const show = (next: OutlineEntry[]) => {
      entries = next;
      onSourceOutline(next);
      update();
    };
    let current = true;
    void source.grammar.then(() => current && show(source.outline()));
    const stop = source.onOutline(show);
    const stopScroll = onFrameScroll(source.view.scrollDOM, update);
    return () => {
      current = false;
      stop();
      stopScroll();
    };
  }, [onSourceOutline, onHeading, view, sourceReady]);

  useEffect(() => {
    onWeight?.(contentWeight(rendered, showsSource(view) || host().source ? source.text : null));
  }, [rendered, view, source.text, onWeight]);

  useLayoutEffect(() => {
    const sourceView = host().source;
    if (!follow || view !== 'source' || !sourceView) return;
    sourceView.scrollToEnd();
    return sourceView.onScrollUp(() => onFollowEnded?.());
  }, [follow, view, source.text, onFollowEnded, sourceReady]);

  // After the effects that fill the views: the source editor loads lazily, rendered content arrives late.
  const foundFor = useRef<number | null>(null);
  useEffect(() => {
    if (!pendingFind || foundFor.current === pendingFind.token) return;
    if (showsSource(view) ? !(sourceReady && host().source) : !rendered) return;
    foundFor.current = pendingFind.token;
    onPendingFind?.(active().find(pendingFind.query, { caseSensitive: pendingFind.caseSensitive, line: pendingFind.line }));
  }, [pendingFind, view, sourceReady, rendered]);

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
