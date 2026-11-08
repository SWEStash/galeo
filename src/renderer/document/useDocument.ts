import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentContent, ReadReply } from '../../shared/contracts';
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
 * a new `staleReads` count (the file changed) reads it again in place. A re-read names the version
 * shown, so main can send only what was added (ADR-033).
 */
export function useDocument(
  id: string,
  staleReads: number,
  say: (message: string) => void,
): { document: OpenDocument | null; navigated: () => void } {
  const [document, setDocument] = useState<OpenDocument | null>(null);
  const [navigation, setNavigation] = useState(0);
  const shown = useRef<OpenDocument | null>(null);

  useEffect(() => {
    let current = true;
    const showing = shown.current?.navigation === navigation ? shown.current.content : null;
    const held = showing?.state === 'ready' ? showing.version : null;
    const take = (reply: ReadReply): Promise<void> | void => {
      if (!current) return;
      let content: DocumentContent;
      if (reply.state === 'appended') {
        // Only the text it holds can take the append; anything else reads the whole file again.
        if (showing?.state !== 'ready' || showing.version !== reply.base) return window.galeo.documents.read(id, null).then(take);
        if (reply.text === '') return;
        content = { ...showing, text: showing.text + reply.text, size: reply.size, version: reply.version, grownFrom: showing.text.length };
      } else {
        content = reply;
      }
      shown.current = { content, navigation, generation: navigation + staleReads };
      setDocument(shown.current);
    };
    void window.galeo.documents
      .read(id, held)
      .then(take)
      .catch(unlessClosed(say, "galeo couldn't read this file"));
    return () => {
      current = false;
    };
  }, [id, navigation, staleReads, say]);

  const navigated = useCallback(() => setNavigation((n) => n + 1), []);
  return { document, navigated };
}
