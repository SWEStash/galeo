import { useEffect, useState } from 'react';
import type { DocumentContent } from '../../shared/contracts';

/** The first document open in this window, read from main. One per window until tabs arrive. */
export function useFirstDocument(): DocumentContent | null {
  const [content, setContent] = useState<DocumentContent | null>(null);

  useEffect(() => {
    let current = true;
    void (async () => {
      const [first] = await window.galeo.documents.list();
      if (!first) return;
      const read = await window.galeo.documents.read(first.id);
      if (current) setContent(read);
    })();
    return () => {
      current = false;
    };
  }, []);

  return content;
}
