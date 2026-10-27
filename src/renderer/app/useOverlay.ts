import { useCallback, useRef, useState } from 'react';
import { settleFocus } from '../document/settle-focus';

/** The window's overlays; one shows at a time. */
type Overlay = 'quickOpen' | 'tabSearch' | 'tabOverview' | 'findAll' | 'palette' | 'about' | 'moveTab';

/** Where focus goes back to when an overlay closes, unless told otherwise: the document being read. */
const SHOWN_DOCUMENT = '[data-testid="tab-panel"][data-active="true"] [data-testid="document"]';

/** One overlay at a time: quick open, tab search, the tab overview, find in all tabs, the palette, About or the windows a tab can move to. */
export function useOverlay() {
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  // Where focus goes when the overlay closes, if not the document: About from the profile menu, whose item is gone.
  const returnFocus = useRef<string | null>(null);
  const openOverlay = useCallback((next: Overlay) => setOverlay(next), []);
  /** The next close sends focus to `selector` (null: the document). */
  const returnFocusTo = useCallback((selector: string | null) => {
    returnFocus.current = selector;
  }, []);
  const closeOverlay = useCallback(() => {
    setOverlay(null);
    const to = returnFocus.current ?? SHOWN_DOCUMENT;
    returnFocus.current = null;
    // Focus goes back to the document being read (UX F8), once the dialog has let it go: its own
    // restore lands a frame or more later, on the tab shown before (hidden if another is shown now).
    settleFocus(() => document.querySelector<HTMLElement>(to)?.focus());
  }, []);
  return { overlay, openOverlay, closeOverlay, returnFocusTo };
}
