import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImageExpand } from './images';
import type { DiagramExpand } from './requests';
import { settleFocus } from './settle-focus';
import type { ZoomContent } from './ZoomViewer';

/**
 * The zoom viewer of the shown tab: a diagram or image the reader expanded. Switching tabs closes it,
 * and focus goes back to its Expand button once it is gone.
 */
export function useZoomViewer(active: boolean) {
  const [viewer, setViewer] = useState<{ content: ZoomContent; name: string; returnFocus: () => void } | null>(null);
  const expandDiagram = useCallback(
    ({ svg, name, panel, returnFocus }: DiagramExpand) => setViewer({ content: { kind: 'diagram', svg, panel }, name, returnFocus }),
    [],
  );
  const expandImage = useCallback(({ url, name, returnFocus }: ImageExpand) => setViewer({ content: { kind: 'image', url }, name, returnFocus }), []);
  const closeViewer = useCallback(() => setViewer(null), []);
  useEffect(() => {
    if (!active) setViewer(null);
  }, [active]);
  const returnFocus = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (viewer) {
      returnFocus.current = viewer.returnFocus;
      return;
    }
    const back = returnFocus.current;
    returnFocus.current = null;
    if (!back) return;
    return settleFocus(back);
  }, [viewer]);
  return { viewer, expandDiagram, expandImage, closeViewer };
}
