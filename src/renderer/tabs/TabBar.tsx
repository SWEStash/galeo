import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { isTextDropItem, Tab, TabList, useDrag, useDrop } from 'react-aria-components';
import type { DocumentRecord } from '../../shared/documents';
import { tabLabels } from '../../shared/tab-labels';
import { editors } from '../edit/editors';
import { watchDragExit } from './drag-exit';
import type { TabStatus, TabStore, TabsView } from './store';
import { insertion, overflowEdges, wheelScroll } from './strip';

/** A tab being dragged: the tab bars of every galeo window take it, nothing else does (ADR-019). */
const TAB_TYPE = 'application/x-galeo-tab';

/**
 * The window's tabs (UX §2): an ARIA tablist in the title bar. Its empty space, and a grip at its
 * end that tabs never fill, drag the window; while a tab is dragged, only the grip does.
 * ←/→ move between tabs, Enter or Space shows one, Delete closes it; a tab closes on middle-click
 * or its ✕ too, and drags to a new place, to another window's tab bar, or out to a window of its
 * own (UX F15).
 */
export function TabBar({
  view,
  store,
  start,
  onOpenFile,
  onFilesDropped,
}: {
  view: TabsView;
  store: TabStore;
  start?: ReactNode;
  onOpenFile?: () => void;
  /** Files from the file manager were dropped at the caret: they go after this tab (null: first). */
  onFilesDropped?: (after: string | null) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const labels = tabLabels(view.tabs.map((tab) => tab.path));
  const [caret, setCaret] = useState<{ index: number; left: number } | null>(null);
  const [edges, setEdges] = useState({ overflows: false, canLeft: false, canRight: false });

  // ‹ › show while the tabs overflow; the wheel scrolls the strip sideways and never switches tabs.
  useEffect(() => {
    const strip = listRef.current!;
    const measure = () =>
      setEdges((now) => {
        const next = overflowEdges(strip);
        return next.overflows === now.overflows && next.canLeft === now.canLeft && next.canRight === now.canRight ? now : next;
      });
    const onWheel = (event: WheelEvent) => {
      // Ctrl and the wheel zoom, wherever the pointer is.
      if (event.ctrlKey) return;
      const delta = wheelScroll(event, strip.clientWidth);
      if (delta === 0 || !overflowEdges(strip).overflows) return;
      event.preventDefault();
      strip.scrollLeft += delta;
    };
    const resized = new ResizeObserver(measure);
    resized.observe(strip);
    for (const child of strip.children) resized.observe(child);
    strip.addEventListener('scroll', measure, { passive: true });
    strip.addEventListener('wheel', onWheel, { passive: false });
    measure();
    return () => {
      resized.disconnect();
      strip.removeEventListener('scroll', measure);
      strip.removeEventListener('wheel', onWheel);
    };
  }, [view.tabs]);

  const scrollBy = (direction: -1 | 1) => {
    const strip = listRef.current!;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    strip.scrollBy({ left: direction * strip.clientWidth * 0.8, behavior: smooth ? 'smooth' : 'auto' });
  };

  // When tabs overflow, the strip scrolls so the shown tab stays in view.
  useEffect(() => {
    if (!view.active) return;
    const active = listRef.current?.querySelector(`[data-tab-id="${CSS.escape(view.active)}"]`);
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [view.active, view.tabs]);

  const insertionAt = (x: number) => {
    const list = listRef.current!;
    const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')].map((tab) => tab.getBoundingClientRect());
    return insertion(x, { left: list.getBoundingClientRect().left, scrollLeft: list.scrollLeft }, tabs);
  };

  const { dropProps } = useDrop({
    ref: listRef,
    // Tabs move; files from the file manager open at the caret (their paths reach main from the preload only).
    getDropOperation: (types) => (types.has(TAB_TYPE) ? 'move' : onFilesDropped ? 'copy' : 'cancel'),
    onDropMove: (event) => setCaret(insertionAt(event.x)),
    onDropExit: () => setCaret(null),
    onDrop: async (event) => {
      setCaret(null);
      const item = event.items.filter(isTextDropItem).find((each) => each.types.has(TAB_TYPE));
      if (!item) {
        const at = insertionAt(event.x).index;
        onFilesDropped?.(at === 0 ? null : view.tabs[at - 1]!.id);
        return;
      }
      const id = await item.getText(TAB_TYPE);
      const from = view.tabs.findIndex((tab) => tab.id === id);
      let to = insertionAt(event.x).index;
      // Another window's tab: main hands it over if that window's drag still carries it.
      if (from < 0) return store.adopt(id, to);
      if (to > from) to -= 1;
      if (to !== from) store.move(id, to);
    },
  });

  // Where the pointer is while one of this window's tabs is dragged: a drag that ends out of the window,
  // over another application or none, gives the tab a window of its own unless a galeo window takes it.
  const exit = useRef<ReturnType<typeof watchDragExit> | null>(null);
  useEffect(() => () => exit.current?.stop(), []);
  const dragStarted = (id: string) => {
    exit.current?.stop();
    exit.current = watchDragExit(document);
    // Main moves the tab's unsaved text: it must have the latest before another window takes it.
    editors.get(id)?.keepNow();
    store.dragStarted(id);
  };
  const dragEnded = (id: string) => {
    const outside = exit.current?.outside() ?? false;
    exit.current?.stop();
    exit.current = null;
    store.dragEnded(id, outside);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const tab = (event.target as HTMLElement).closest<HTMLElement>('[data-tab-id]');
    if (event.key === 'Delete' && tab) {
      event.preventDefault();
      store.close(tab.dataset['tabId']!);
    }
  };

  return (
    <div className="tab-bar" data-testid="tab-bar" data-tab-drag={view.dragging || undefined}>
      {start}
      {edges.overflows && <ScrollButton direction={-1} disabled={!edges.canLeft} onScroll={scrollBy} />}
      <div className="tab-strip" ref={listRef} {...dropProps} onKeyDown={onKeyDown}>
        <TabList aria-label="Open documents" className="tab-list" items={view.tabs.map((tab, index) => ({ ...tab, label: tab.kind === 'settings' ? 'Settings' : labels[index]! }))}>
          {(tab) => (
            <TabItem
              tab={tab}
              label={tab.label}
              status={view.statuses.get(tab.id)}
              hibernated={!view.rendered.has(tab.id)}
              reloaded={view.reloaded.has(tab.id)}
              crashed={view.crashed.has(tab.id)}
              onClose={() => store.close(tab.id)}
              onDragStart={dragStarted}
              onDragEnd={dragEnded}
            />
          )}
        </TabList>
        {caret && <div className="tab-caret" data-testid="tab-caret" style={{ left: caret.left }} />}
      </div>
      {edges.overflows && <ScrollButton direction={1} disabled={!edges.canRight} onScroll={scrollBy} />}
      {onOpenFile && (
        <button type="button" className="tab-new" data-testid="tab-new" aria-label="Open file… (Ctrl+P)" title="Open file… (Ctrl+P)" onClick={onOpenFile}>
          +
        </button>
      )}
      {/* Tabs never cover this: the window can always be dragged, however many are open. */}
      <div className="window-grip" data-testid="window-grip" />
    </div>
  );
}

/**
 * ‹ or › at an end of an overflowing strip. A mouse affordance, out of the Tab order: the keyboard
 * moves along the tabs with Ctrl+Tab and Ctrl+1–9.
 */
function ScrollButton({ direction, disabled, onScroll }: { direction: -1 | 1; disabled: boolean; onScroll: (direction: -1 | 1) => void }) {
  const name = direction < 0 ? 'Scroll tabs left' : 'Scroll tabs right';
  return (
    <button type="button" className="tab-scroll" tabIndex={-1} aria-label={name} title={name} disabled={disabled} onClick={() => onScroll(direction)}>
      <span aria-hidden="true">{direction < 0 ? '‹' : '›'}</span>
    </button>
  );
}

/** Tab indicators (UX F4): always a glyph with words, never colour alone; the words are in the tab's name. */
function indicators(status: TabStatus | undefined, reloaded: boolean, crashed: boolean): { glyph: string; words: string }[] {
  const shown = [];
  if (crashed) shown.push({ glyph: '⚠', words: 'crashed the viewer' });
  if (reloaded) shown.push({ glyph: '↻', words: 'reloaded from disk' });
  if (status?.follow) shown.push({ glyph: '⇣', words: 'following the end' });
  if (status?.state === 'missing') shown.push({ glyph: '✕', words: 'file missing' });
  if (status?.editing) shown.push({ glyph: '✎', words: 'edit mode' });
  if (status?.dirty) shown.push({ glyph: '●', words: 'unsaved changes' });
  return shown;
}

function TabItem({
  tab,
  label,
  status,
  hibernated,
  reloaded,
  crashed,
  onClose,
  onDragStart,
  onDragEnd,
}: {
  tab: DocumentRecord;
  label: string;
  status: TabStatus | undefined;
  hibernated: boolean;
  reloaded: boolean;
  crashed: boolean;
  onClose: () => void;
  onDragStart: (id: string) => void;
  onDragEnd: (id: string) => void;
}) {
  const { dragProps, isDragging } = useDrag({
    // The custom type only: no other application takes a tab (ADR-019).
    getItems: () => [{ [TAB_TYPE]: tab.id }],
    onDragStart: () => onDragStart(tab.id),
    onDragEnd: () => onDragEnd(tab.id),
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
      {/* All of the tab but its ✕ starts a drag, edge to edge. */}
      <span className="tab-grab" {...dragProps} onAuxClick={onAuxClick}>
        <span className="tab-label" title={tab.path}>
          {label}
        </span>
        {indicators(status, reloaded, crashed).map(({ glyph, words }) => (
          <span key={glyph} className="tab-indicator" data-indicator={words} title={words}>
            <span aria-hidden="true">{glyph}</span>
            <span className="visually-hidden">, {words}</span>
          </span>
        ))}
      </span>
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
