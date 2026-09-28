import { useCallback, useEffect, useState } from 'react';
import type { DocumentContent } from '../../shared/contracts';
import { ignoreClosedTab } from '../tabs/closed-tab';

export interface OpenDocument {
  content: DocumentContent;
  /** Counts reads, so the page can reset per-document state after a navigation. */
  generation: number;
}

/**
 * One tab's document, read from main; `reload` reads it again (after main navigated the tab), and
 * so does a new `staleReads` count (main said the file changed).
 */
export function useDocument(id: string, staleReads = 0): { document: OpenDocument | null; reload: () => void } {
  const [document, setDocument] = useState<OpenDocument | null>(null);
  const [reads, setReads] = useState(0);

  useEffect(() => {
    let current = true;
    void window.galeo.documents
      .read(id)
      .then((content) => {
        if (current) setDocument({ content, generation: reads + staleReads });
      })
      .catch(ignoreClosedTab);
    return () => {
      current = false;
    };
  }, [id, reads, staleReads]);

  const reload = useCallback(() => setReads((n) => n + 1), []);
  return { document, reload };
}
