import { createContext, useCallback, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

/** What the window's right side shows: the outline or the watched folder, one at a time. */
type RightPanel = 'outline' | 'watch' | null;

const RightPanelContext = createContext<readonly [RightPanel, Dispatch<SetStateAction<RightPanel>>]>([null, () => {}]);

/** The right panel: one setting for the window, so the outline stays open across tabs. */
export function RightPanelProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<RightPanel>(null);
  return <RightPanelContext value={[panel, setPanel]}>{children}</RightPanelContext>;
}

/** Whether `name` shows on the right; opening it closes the other. */
function usePanel(name: Exclude<RightPanel, null>): readonly [open: boolean, setOpen: (open: boolean) => void] {
  const [panel, setPanel] = useContext(RightPanelContext);
  const setOpen = useCallback((open: boolean) => setPanel((current) => (open ? name : current === name ? null : current)), [name, setPanel]);
  return [panel === name, setOpen];
}

export const useOutline = () => usePanel('outline');
export const useWatchPanel = () => usePanel('watch');
