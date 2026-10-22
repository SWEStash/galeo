import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { isTextDropItem, Tab, TabList, useDrag, useDrop } from 'react-aria-components';
import type { TabView } from '../../shared/tabs';
import { tabLabels } from '../../shared/tab-labels';
import { editors } from '../edit/editors';
import { watchDragExit } from './drag-exit';
import { fromGaleo, TAB_TYPE } from './drag-types';
import { indicators } from './indicators';
import { markerOf, rowName } from './side-panel';
import type { TabStatus, TabStore, TabsView } from './store';
import { insertion, spanOf, type Axis } from './strip';

/**
 * How the strip draws its tabs: along the tab bar, as rows of the side panel, or as the collapsed
 * panel's markers (ADR-023).
 */
export type TabLayout = 'bar' | 'rows' | 'markers';

/** A marker the keyboard or the pointer is on: the side panel shows its tooltip beside it. */
export interface MarkerTip {
  text: string;
  /** The marker's middle, from the viewport's top. */
  top: number;
}

/**
 * The window's tabs as an ARIA tablist, and the drop target around them: tabs dragged here move to
 * the caret, from this window or another (ADR-022), files open there, and a tab dragged out of every
 * window gets one of its own (UX F15). The tab bar and the side panel both show it.
 */
export function TabStrip({
  view,
  store,
  layout,
  stripRef,
  onFilesDropped,
  onMarkerTip,
}: {
  view: TabsView;
  store: TabStore;
  layout: TabLayout;
  stripRef: RefObject<HTMLDivElement | null>;
  /** Files from the file manager were dropped at the caret: they go after this tab (null: first). */
  onFilesDropped?: (after: string | null) => void;
  onMarkerTip?: (tip: MarkerTip | null) => void;
}) {
  const axis: Axis = layout === 'bar' ? 'x' : 'y';
  const labels = tabLabels(view.tabs.map((tab) => tab.path));
  const [caret, setCaret] = useState<{ index: number; offset: number } | null>(null);

  const insertionAt = (at: number) => {
    const list = stripRef.current!;
    const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')].map((tab) => spanOf(tab.getBoundingClientRect(), axis));
    const box = list.getBoundingClientRect();
    return axis === 'x' ? insertion(at, { start: box.left, scroll: list.scrollLeft }, tabs) : insertion(at, { start: box.top, scroll: list.scrollTop }, tabs);
  };

  const { dropProps } = useDrop({
    ref: stripRef,
    // Tabs move; files from the file manager open at the caret (their paths reach main from the preload only).
    getDropOperation: (types) => (types.has(TAB_TYPE) ? 'move' : onFilesDropped && !fromGaleo(types) ? 'copy' : 'cancel'),
    onDropMove: (event) => setCaret(insertionAt(axis === 'x' ? event.x : event.y)),
    onDropExit: () => setCaret(null),
    onDrop: async (event) => {
      setCaret(null);
      const at = axis === 'x' ? event.x : event.y;
      const item = event.items.filter(isTextDropItem).find((each) => each.types.has(TAB_TYPE));
      if (!item) {
        const index = insertionAt(at).index;
        onFilesDropped?.(index === 0 ? null : view.tabs[index - 1]!.id);
        return;
      }
      const token = await item.getText(TAB_TYPE);
      const own = store.draggedHere(token);
      const from = own === null ? -1 : view.tabs.findIndex((tab) => tab.id === own);
      let to = insertionAt(at).index;
      // Another window's tab: main hands it over if that window's drag still has this token (ADR-022).
      if (from < 0) return store.adopt(token, to);
      const id = view.tabs[from]!.id;
      if (to > from) to -= 1;
      if (to !== from) store.move(id, to);
    },
  });

  // Where the pointer is while one of this window's tabs is dragged: a drag that ends out of the window,
  // over another application or none, gives the tab a window of its own unless a galeo window takes it.
  const exit = useRef<ReturnType<typeof watchDragExit> | null>(null);
  useEffect(() => () => exit.current?.stop(), []);
  const dragStarted = (id: string, token: string) => {
    onMarkerTip?.(null);
    exit.current?.stop();
    exit.current = watchDragExit(document);
    // Main moves the tab's unsaved text: it must have the latest before another window takes it.
    editors.get(id)?.keepNow();
    store.dragStarted(id, token);
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
    <div className="tab-strip" data-axis={axis} ref={stripRef} {...dropProps} onKeyDown={onKeyDown}>
      <TabList aria-label="Open documents" className="tab-list" items={view.tabs.map((tab, index) => ({ ...tab, label: tab.kind === 'settings' ? 'Settings' : labels[index]! }))}>
        {(tab) => (
          <TabItem
            tab={tab}
            label={layout === 'bar' ? tab.label : rowName(tab)}
            layout={layout}
            status={view.statuses.get(tab.id)}
            hibernated={!view.rendered.has(tab.id)}
            reloaded={view.reloaded.has(tab.id)}
            crashed={view.crashed.has(tab.id)}
            onClose={() => store.close(tab.id)}
            onDragStart={dragStarted}
            onDragEnd={dragEnded}
            onMarkerTip={onMarkerTip}
          />
        )}
      </TabList>
      {caret && <div className="tab-caret" data-testid="tab-caret" style={axis === 'x' ? { left: caret.offset } : { top: caret.offset }} />}
    </div>
  );
}

function TabItem({
  tab,
  label,
  layout,
  status,
  hibernated,
  reloaded,
  crashed,
  onClose,
  onDragStart,
  onDragEnd,
  onMarkerTip,
}: {
  tab: TabView;
  label: string;
  layout: TabLayout;
  status: TabStatus | undefined;
  hibernated: boolean;
  reloaded: boolean;
  crashed: boolean;
  onClose: () => void;
  onDragStart: (id: string, token: string) => void;
  onDragEnd: (id: string) => void;
  onMarkerTip: ((tip: MarkerTip | null) => void) | undefined;
}) {
  // Each drag's single-use token: the drag carries it, not the tab id (ADR-022). React Aria asks for
  // the items after it reports the start.
  const token = useRef('');
  const { dragProps, isDragging } = useDrag({
    // The custom type only: no other application takes a tab (ADR-019).
    getItems: () => [{ [TAB_TYPE]: token.current }],
    onDragStart: () => {
      token.current = crypto.randomUUID();
      onDragStart(tab.id, token.current);
    },
    onDragEnd: () => onDragEnd(tab.id),
    // Keyboard users reorder with Ctrl+Shift+PgUp/PgDn; Enter on a tab still shows it.
    hasDragButton: true,
  });
  const onAuxClick = (event: MouseEvent) => {
    if (event.button === 1) onClose();
  };
  const shown = indicators(status, reloaded, crashed);
  const marks = shown.map(({ glyph, words }) => (
    <span key={glyph} className="tab-indicator" data-indicator={words} title={words}>
      <span aria-hidden="true">{glyph}</span>
      <span className="visually-hidden">, {words}</span>
    </span>
  ));
  const folder = tab.kind === 'settings' ? '' : (tab.folder ?? '');

  // A collapsed marker's tooltip: on the pointer, and on keyboard focus (not after a click).
  const tipText = [folder ? `${label} — ${folder}` : label, ...shown.map((each) => each.words)].join(', ');
  const showTip = (element: Element) => {
    const box = element.getBoundingClientRect();
    onMarkerTip?.({ text: tipText, top: box.top + box.height / 2 });
  };
  const markerFocus =
    layout === 'markers'
      ? {
          onFocus: (event: FocusEvent<Element>) => {
            if (event.currentTarget.matches(':focus-visible')) showTip(event.currentTarget);
          },
          onBlur: () => onMarkerTip?.(null),
        }
      : {};

  const close = (
    // Pointer only: a tab can't hold another control, and Delete closes it from the keyboard.
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
  );

  return (
    <Tab
      id={tab.id}
      className="tab"
      data-tab-id={tab.id}
      data-layout={layout}
      data-dragging={isDragging || undefined}
      data-hibernated={hibernated || undefined}
      data-missing={status?.state === 'missing' || undefined}
      {...markerFocus}
    >
      {layout === 'markers' ? (
        <MarkerContent tab={tab} label={label} folder={folder} status={status} reloaded={reloaded} crashed={crashed} grab={{ ...dragProps, onAuxClick, onPointerEnter: (event: PointerEvent<Element>) => showTip(event.currentTarget), onPointerLeave: () => onMarkerTip?.(null) }}>
          {marks}
        </MarkerContent>
      ) : layout === 'rows' ? (
        <>
          {/* All of the row but its ✕ starts a drag. */}
          <span className="tab-grab" {...dragProps} onAuxClick={onAuxClick} title={tab.path || undefined}>
            <span className="tab-line">
              <span className="tab-label">{label}</span>
              {marks}
            </span>
            {folder && (
              <span className="tab-folder">
                <span className="visually-hidden">, </span>
                <bdi>{folder}</bdi>
              </span>
            )}
          </span>
          {close}
        </>
      ) : (
        <>
          {/* All of the tab but its ✕ starts a drag, edge to edge. */}
          <span className="tab-grab" {...dragProps} onAuxClick={onAuxClick}>
            <span className="tab-label" title={tab.path}>
              {label}
            </span>
            {marks}
          </span>
          {close}
        </>
      )}
    </Tab>
  );
}

/** A collapsed tab: its letter and one mark on show; its whole name, folder and indicators for screen readers. */
function MarkerContent({
  tab,
  label,
  folder,
  status,
  reloaded,
  crashed,
  grab,
  children,
}: {
  tab: TabView;
  label: string;
  folder: string;
  status: TabStatus | undefined;
  reloaded: boolean;
  crashed: boolean;
  grab: object;
  children: ReactNode;
}) {
  const { letter, mark } = markerOf(tab, status, reloaded, crashed);
  return (
    <span className="tab-grab" {...grab}>
      <span className="tab-marker" aria-hidden="true">
        {letter}
        {mark && <span className="tab-marker-mark">{mark.glyph}</span>}
      </span>
      <span className="visually-hidden">
        {label}
        {folder && `, ${folder}`}
      </span>
      <span className="tab-marker-marks">{children}</span>
    </span>
  );
}
