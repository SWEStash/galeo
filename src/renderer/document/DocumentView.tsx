import { useLayoutEffect, useRef } from 'react';
import { mountDocumentHost, type ColorScheme } from './host';

/**
 * A document, rendered outside React (ADR-006): React owns only the container element; the
 * document lives in its shadow root and is updated in place.
 */
export function DocumentView({ html, scheme }: { html: string; scheme: ColorScheme }) {
  const container = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    mountDocumentHost(container.current!).setContent(html);
  }, [html]);

  useLayoutEffect(() => {
    mountDocumentHost(container.current!).setScheme(scheme);
  }, [scheme]);

  return <div ref={container} className="document-view" data-testid="document" />;
}
