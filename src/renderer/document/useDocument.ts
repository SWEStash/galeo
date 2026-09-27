import { useCallback, useEffect, useState } from 'react';
import type { DocumentContent } from '../../shared/contracts';

export interface OpenDocument {
  id: string;
  content: DocumentContent;
  /** Counts reads, so the page can reset per-document state after a navigation. */
  generation: number;
}

/**
 * The first document open in this window, read from main; `reload` reads it again (after
 * main navigated it). One document per window until tabs arrive.
 */
export function useDocument(): { document: OpenDocument | null; reload: () => void } {
  const [document, setDocument] = useState<OpenDocument | null>(null);
  const [reads, setReads] = useState(0);

  useEffect(() => {
    let current = true;
    void (async () => {
      const [first] = await window.galeo.documents.list();
      if (!first) return;
      const content = await window.galeo.documents.read(first.id);
      if (current) setDocument({ id: first.id, content, generation: reads });
    })();
    return () => {
      current = false;
    };
  }, [reads]);

  const reload = useCallback(() => setReads((n) => n + 1), []);
  return { document, reload };
}
