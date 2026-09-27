import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react';
import type { ImageResult } from '../../shared/documents';
import type { ViewMode } from '../../shared/formats';
import { ID_PREFIX } from '../../shared/markdown/ids';
import { markDocumentPaint } from '../perf';
import { blockAtOrBefore, firstVisibleLine } from './anchor';
import { mountDocumentHost, type ColorScheme, type DocumentHost } from './host';
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
  /** Find in whichever view is showing, scroll to anchors, and focus the document area. */
  ref?: Ref<DocumentHandle>;
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
  onResolveImage,
  scheme,
  ref,
}: DocumentViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const linkListener = useRef(onLink);
  linkListener.current = onLink;
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
    root.addEventListener('click', onClick);
    root.addEventListener('auxclick', onClick);
    return () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('auxclick', onClick);
    };
  }, []);

  useLayoutEffect(() => {
    if (!rendered) return;
    if ('html' in rendered) host().setContent(rendered.html);
    else host().setReaderText(rendered.text);
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

  useLayoutEffect(() => {
    if (view === 'source' || host().source) host().showSource(source.text, source.language, wrap);
    if (view === 'source') markDocumentPaint();
  }, [source.text, source.language, view, wrap]);

  useLayoutEffect(() => {
    const documentHost = host();
    const previous = shownView.current;
    if (previous === view) return;
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
  }, [view]);

  useLayoutEffect(() => {
    const sourceView = host().source;
    if (!follow || view !== 'source' || !sourceView) return;
    sourceView.scrollToEnd();
    return sourceView.onScrollUp(() => onFollowEnded?.());
  }, [follow, view, source.text, onFollowEnded]);

  useLayoutEffect(() => {
    host().setScheme(scheme);
  }, [scheme]);

  return (
    <div
      ref={container}
      className="document-view"
      data-testid="document"
      data-follow={follow ? 'on' : 'off'}
      // The document area takes focus, for keyboard scrolling and for focus after find (UX §7).
      tabIndex={0}
      role="document"
      aria-label="Document"
    />
  );
}
