import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { isTextDropItem, Tab, TabList, useDrag, useDrop } from 'react-aria-components';
import type { DocumentRecord } from '../../shared/documents';
import { tabLabels } from '../../shared/tab-labels';
import type { TabStatus, TabStore, TabsView } from './store';

/** A tab being dragged within the tab bar; nothing else accepts it. */
const TAB_TYPE = 'application/x-galeo-tab';

/**
 * The window's tabs (UX §2): an ARIA tablist in the title bar. Its empty space, and a grip at its
 * end that tabs never fill, drag the window.
 * ←/→ move between tabs, Enter or Space shows one, Delete closes it; a tab closes on middle-click
 * or its ✕ too, and drags to a new place.
 */
export function TabBar({ view, store, start }: { view: TabsView; store: TabStore; start?: ReactNode }) {
  const listRef = useRef<HTMLDivElement>(null);
  const labels = tabLabels(view.tabs.map((tab) => tab.path));
  const [caret, setCaret] = useState<{ index: number; left: number } | null>(null);

  // When tabs overflow, the strip scrolls so the shown tab stays in view.
  useEffect(() => {
    if (!view.active) return;
    const active = listRef.current?.querySelector(`[data-tab-id="${CSS.escape(view.active)}"]`);
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [view.active, view.tabs]);

  const insertionAt = (x: number) => {
    const list = listRef.current!;
    const box = list.getBoundingClientRect();
    const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')].map((tab) => tab.getBoundingClientRect());
    const index = tabs.findIndex((tab) => box.left + x < tab.left + tab.width / 2);
    const at = index < 0 ? tabs.length : index;
    const edge = at < tabs.length ? tabs[at]!.left : (tabs.at(-1)?.right ?? box.left);
    return { index: at, left: edge - box.left };
  };

  const { dropProps } = useDrop({
    ref: listRef,
    getDropOperation: (types) => (types.has(TAB_TYPE) ? 'move' : 'cancel'),
    onDropMove: (event) => setCaret(insertionAt(event.x)),
    onDropExit: () => setCaret(null),
    onDrop: async (event) => {
      setCaret(null);
      const item = event.items.filter(isTextDropItem).find((each) => each.types.has(TAB_TYPE));
      if (!item) return;
      const id = await item.getText(TAB_TYPE);
      const from = view.tabs.findIndex((tab) => tab.id === id);
      let to = insertionAt(event.x).index;
      if (from < 0) return;
      if (to > from) to -= 1;
      if (to !== from) store.move(id, to);
    },
  });

  const onKeyDown = (event: KeyboardEvent) => {
    const tab = (event.target as HTMLElement).closest<HTMLElement>('[data-tab-id]');
    if (event.key === 'Delete' && tab) {
      event.preventDefault();
      store.close(tab.dataset['tabId']!);
    }
  };

  return (
    <div className="tab-bar" data-testid="tab-bar">
      {start}
      <div className="tab-strip" ref={listRef} {...dropProps} onKeyDown={onKeyDown}>
        <TabList aria-label="Open documents" className="tab-list" items={view.tabs.map((tab, index) => ({ ...tab, label: labels[index]! }))}>
          {(tab) => (
            <TabItem
              tab={tab}
              label={tab.label}
              status={view.statuses.get(tab.id)}
              hibernated={!view.rendered.has(tab.id)}
              onClose={() => store.close(tab.id)}
            />
          )}
        </TabList>
        {caret && <div className="tab-caret" data-testid="tab-caret" style={{ left: caret.left }} />}
      </div>
      {/* Tabs never cover this: the window can always be dragged, however many are open. */}
      <div className="window-grip" data-testid="window-grip" />
    </div>
  );
}

/** Tab indicators (UX F4): always a glyph with words, never colour alone; the words are in the tab's name. */
function indicators(status: TabStatus | undefined): { glyph: string; words: string }[] {
  const shown = [];
  if (status?.follow) shown.push({ glyph: '⇣', words: 'following the end' });
  if (status?.state === 'missing') shown.push({ glyph: '✕', words: 'file missing' });
  return shown;
}

function TabItem({
  tab,
  label,
  status,
  hibernated,
  onClose,
}: {
  tab: DocumentRecord;
  label: string;
  status: TabStatus | undefined;
  hibernated: boolean;
  onClose: () => void;
}) {
  const { dragProps, isDragging } = useDrag({
    getItems: () => [{ [TAB_TYPE]: tab.id }],
    // Keyboard users reorder with Ctrl+Shift+PgUp/PgDn; Enter on a tab still shows it.
    hasDragButton: true,
  });
  const onAuxClick = (event: MouseEvent) => {
    if (event.button === 1) onClose();
  };
  return (
    <Tab
      id={tab.id}
      className="tab"
      data-tab-id={tab.id}
      data-dragging={isDragging || undefined}
      data-hibernated={hibernated || undefined}
      data-missing={status?.state === 'missing' || undefined}
    >
      <span className="tab-label" title={tab.path} {...dragProps} onAuxClick={onAuxClick}>
        {label}
      </span>
      {indicators(status).map(({ glyph, words }) => (
        <span key={glyph} className="tab-indicator" title={words}>
          <span aria-hidden="true">{glyph}</span>
          <span className="visually-hidden">, {words}</span>
        </span>
      ))}
      {/* Pointer only: a tab can't hold another control, and Delete closes it from the keyboard. */}
      <span
        className="tab-close"
        aria-hidden="true"
        title="Close (Ctrl+W)"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        onAuxClick={onAuxClick}
      >
        ✕
      </span>
    </Tab>
  );
}
