import { useEffect, useState } from 'react';
import type { DocumentContent } from '../../shared/contracts';
import type { RenderClient } from '../worker/client';

export type ShownDocument =
  | { kind: 'rendered'; content: Extract<DocumentContent, { state: 'ready' }>; html: string }
  | { kind: 'content'; content: DocumentContent };

/**
 * The first document open in this window, read from main and, when its view is the rendered
 * Markdown view, rendered by the worker. One document per window until tabs arrive.
 */
export function useFirstDocument(client: RenderClient | null): ShownDocument | null {
  const [shown, setShown] = useState<ShownDocument | null>(null);

  useEffect(() => {
    if (!client) return;
    let current = true;
    void (async () => {
      const [first] = await window.galeo.documents.list();
      if (!first) return;
      const content = await window.galeo.documents.read(first.id);
      const next: ShownDocument =
        content.state === 'ready' && content.format === 'markdown' && content.view === 'rendered'
          ? { kind: 'rendered', content, html: (await client.markdown(content.text)).html }
          : { kind: 'content', content };
      if (current) setShown(next);
    })();
    return () => {
      current = false;
    };
  }, [client]);

  return shown;
}
