import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { OutlineEntry } from '../worker/pipeline/render';

interface OutlineNode {
  entry: OutlineEntry;
  children: OutlineNode[];
}

/** Nests each heading under the nearest shallower one before it. */
function nest(entries: readonly OutlineEntry[]): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const open: OutlineNode[] = [];
  for (const entry of entries) {
    while (open.length > 0 && open.at(-1)!.entry.depth >= entry.depth) open.pop();
    const node = { entry, children: [] };
    (open.at(-1)?.children ?? roots).push(node);
    open.push(node);
  }
  return roots;
}

export interface OutlinePanelProps {
  entries: readonly OutlineEntry[];
  /** The id of the heading being read, or null. */
  current: string | null;
  onChoose: (id: string) => void;
  onClose: () => void;
  /** What the panel says with no entries ("No headings"). */
  empty?: string;
  /** Take the focus (the reader opened the panel), on the heading being read. */
  autoFocus?: boolean;
}

/**
 * The outline of the shown Markdown document (UX §2, Ctrl+Shift+O): its headings as nested lists
 * of buttons, the one being read marked as the current location. Esc closes it.
 */
export function OutlinePanel({ entries, current, onChoose, onClose, empty = 'No headings', autoFocus = false }: OutlinePanelProps) {
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    const target = panel.current?.querySelector<HTMLElement>('[aria-current="location"]') ?? panel.current?.querySelector<HTMLElement>('button');
    target?.focus();
    // Only when asked: following the reader must never take the focus.
  }, [autoFocus]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onClose();
  };

  const list = (nodes: OutlineNode[]) => (
    <ul className="outline-list">
      {nodes.map(({ entry, children }) => (
        // Its source line: ids can repeat (empty headings slug alike), lines can't.
        <li key={entry.line}>
          <button
            type="button"
            className="outline-item"
            data-depth={entry.depth}
            aria-current={entry.id === current ? 'location' : undefined}
            onClick={() => onChoose(entry.id)}
          >
            {entry.text}
          </button>
          {children.length > 0 && list(children)}
        </li>
      ))}
    </ul>
  );

  return (
    <nav ref={panel} className="outline-panel" aria-label="Outline" data-testid="outline" onKeyDown={onKeyDown}>
      <h2 className="outline-title">Outline</h2>
      {entries.length > 0 ? list(nest(entries)) : <p className="outline-empty">{empty}</p>}
    </nav>
  );
}
