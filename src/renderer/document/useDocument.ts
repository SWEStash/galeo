import { useCallback, useEffect, useState } from 'react';
import type { DocumentContent } from '../../shared/contracts';
import { unlessClosed } from '../tabs/closed-tab';

interface OpenDocument {
  content: DocumentContent;
  /** Which navigation this read belongs to: a new one starts the document's state afresh. */
  navigation: number;
  /** Counts reads, so a re-read of the same file (it changed on disk) can be told from the first. */
  generation: number;
}

/**
 * One tab's document, read from main. `navigated` reads it again after main navigated the tab;
 * a new `staleReads` count (the file changed) reads it again in place.
 */
export function useDocument(
  id: string,
  staleReads: number,
  say: (message: string) => void,
): { document: OpenDocument | null; navigated: () => void } {
  const [document, setDocument] = useState<OpenDocument | null>(null);
  const [navigation, setNavigation] = useState(0);

  useEffect(() => {
    let current = true;
    void window.galeo.documents
      .read(id)
      .then((content) => {
        if (current) setDocument({ content, navigation, generation: navigation + staleReads });
      })
      .catch(unlessClosed(say, "galeo couldn't read this file"));
    return () => {
      current = false;
    };
  }, [id, navigation, staleReads, say]);

  const navigated = useCallback(() => setNavigation((n) => n + 1), []);
  return { document, navigated };
}
