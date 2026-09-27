import { useEffect, useState } from 'react';
import type { RenderClient } from '../worker/client';

/** The worker's HTML for Markdown `text`, rendered only once `wanted` (the rendered view shows). */
export function useRenderedHtml(client: RenderClient | null, text: string | null, wanted: boolean): string | null {
  const [rendered, setRendered] = useState<{ text: string; html: string } | null>(null);

  useEffect(() => {
    if (!client || text === null || !wanted || rendered?.text === text) return;
    let current = true;
    void client.markdown(text).then(({ html }) => {
      if (current) setRendered({ text, html });
    });
    return () => {
      current = false;
    };
  }, [client, text, wanted, rendered]);

  return rendered?.text === text ? rendered.html : null;
}
