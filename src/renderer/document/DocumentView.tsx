import { useLayoutEffect, useRef } from 'react';
import type { ViewMode } from '../../shared/formats';
import { blockAtOrBefore, firstVisibleLine } from './anchor';
import { mountDocumentHost, type ColorScheme, type DocumentHost } from './host';
import type { SourceLanguage } from './source-view';

export interface DocumentViewProps {
  /** Rendered HTML, or null while it isn't needed or ready. */
  html: string | null;
  source: { text: string; language: SourceLanguage };
  view: ViewMode;
  wrap: boolean;
  scheme: ColorScheme;
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
export function DocumentView({ html, source, view, wrap, scheme }: DocumentViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const shownView = useRef<ViewMode | null>(null);
  const host = () => mountDocumentHost(container.current!);

  useLayoutEffect(() => {
    if (html !== null) host().setContent(html);
  }, [html]);

  useLayoutEffect(() => {
    if (view === 'source' || host().source) host().showSource(source.text, source.language, wrap);
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
    host().setScheme(scheme);
  }, [scheme]);

  return <div ref={container} className="document-view" data-testid="document" />;
}
