import { createContext, useContext, useState, type ReactNode } from 'react';

type OutlineState = readonly [open: boolean, setOpen: (open: boolean) => void];

const OutlineContext = createContext<OutlineState>([false, () => {}]);

/** Whether the outline panel is open: one setting for the window, so it stays open across tabs. */
export function OutlineProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <OutlineContext value={[open, setOpen]}>{children}</OutlineContext>;
}

export const useOutline = (): OutlineState => useContext(OutlineContext);
