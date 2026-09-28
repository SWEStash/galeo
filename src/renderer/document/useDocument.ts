import { useCallback, useEffect, useState } from 'react';
import type { DocumentContent } from '../../shared/contracts';

export interface OpenDocument {
  content: DocumentContent;
  /** Counts reads, so the page can reset per-document state after a navigation. */
  generation: number;
}

/** One tab's document, read from main; `reload` reads it again (after main navigated the tab). */
export function useDocument(id: string): { document: OpenDocument | null; reload: () => void } {
  const [document, setDocument] = useState<OpenDocument | null>(null);
  const [reads, setReads] = useState(0);

  useEffect(() => {
    let current = true;
    void window.galeo.documents.read(id).then((content) => {
      if (current) setDocument({ content, generation: reads });
    });
    return () => {
      current = false;
    };
  }, [id, reads]);

  const reload = useCallback(() => setReads((n) => n + 1), []);
  return { document, reload };
}
