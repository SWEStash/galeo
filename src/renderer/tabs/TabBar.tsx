import { useEffect, useRef, useState, type ReactNode } from 'react';
import { setMarkerTip, StripHost, type PanelProps } from './SidePanel';
import { titleText } from './side-panel';
import type { TabStore, TabsView } from './store';
import { overflowEdges, wheelScroll } from './strip';
import { TabStrip } from './TabStrip';

export const SIDE_PANEL_ID = 'side-tab-panel';

/**
 * The title bar and the window's tabs (UX §2). With the tabs on top it is the tab bar: an ARIA tablist
 * whose empty space, and a grip at its end that tabs never fill, drag the window; while a tab is
 * dragged, only the grip does. ←/→ move between tabs, Enter or Space shows one, Delete closes it; a tab
 * closes on middle-click or its ✕ too, and drags to a new place, to another window's tabs, or out to a
 * window of its own (UX F15).
 *
 * With the tabs on the left (ADR-023) the same list sits in the side panel under the bar, and the bar
 * shows the panel button and the shown tab's name. The list is drawn in the same place either way:
 * React Aria names a list when it mounts, and the documents' panels keep the name they were first
 * given, so the list must never mount again.
 */
export function TabBar({
  view,
  store,
  start,
  onOpenFile,
  onOverview,
  onFilesDropped,
  panel,
}: {
  view: TabsView;
  store: TabStore;
  start?: ReactNode;
  onOpenFile?: () => void;
  /** Shows the tab overview (UX F17). */
  onOverview?: () => void;
  /** Files from the file manager were dropped at the caret: they go after this tab (null: first). */
  onFilesDropped?: (after: string | null) => void;
  /** The side panel, when the profile puts its tabs on the left. */
  panel?: PanelProps | null;
}) {
  const left = Boolean(panel);
  const listRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ overflows: false, canLeft: false, canRight: false });

  // ‹ › show while the tabs overflow the bar; the wheel scrolls the strip sideways and never switches tabs.
  useEffect(() => {
    if (left) return setEdges({ overflows: false, canLeft: false, canRight: false });
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
  }, [view.tabs, left]);

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
  }, [view.active, view.tabs, panel?.collapsed]);

  const toggleName = panel?.collapsed ? 'Expand tab panel' : 'Collapse tab panel';
  return (
    <div className={left ? 'tab-bar title-bar' : 'tab-bar'} data-testid={left ? 'title-bar' : 'tab-bar'} data-tab-drag={view.dragging || undefined}>
      {panel && (
        <button
          type="button"
          className="panel-toggle"
          data-testid="panel-toggle"
          aria-expanded={!panel.collapsed}
          aria-controls={SIDE_PANEL_ID}
          aria-label={toggleName}
          title={`${toggleName} (Ctrl+Shift+B)`}
          onClick={() => panel.onCollapsed(!panel.collapsed)}
        >
          <span aria-hidden="true">◧</span>
        </button>
      )}
      {start}
      {edges.overflows && <ScrollButton direction={-1} disabled={!edges.canLeft} onScroll={scrollBy} />}
      <StripHost panel={panel ?? null} id={SIDE_PANEL_ID}>
        <TabStrip
          view={view}
          store={store}
          layout={!panel ? 'bar' : panel.collapsed ? 'markers' : 'rows'}
          stripRef={listRef}
          onMarkerTip={setMarkerTip}
          {...(onFilesDropped ? { onFilesDropped } : {})}
        />
      </StripHost>
      {edges.overflows && <ScrollButton direction={1} disabled={!edges.canRight} onScroll={scrollBy} />}
      {onOpenFile && (
        <button type="button" className="tab-new" data-testid="tab-new" aria-label="Open file… (Ctrl+P)" title="Open file… (Ctrl+P)" onClick={onOpenFile}>
          +
        </button>
      )}
      {onOverview && (
        <button type="button" className="tab-overview-button" data-testid="tab-overview-button" aria-label="Tab overview (Ctrl+Shift+E)" title="Tab overview (Ctrl+Shift+E)" onClick={onOverview}>
          <span aria-hidden="true">▦</span>
        </button>
      )}
      {/* The window title says it already: this is for the eye, and drags the window like the rest. */}
      {left && (
        <span className="title-bar-text" data-testid="title-bar-text" aria-hidden="true">
          {titleText(view.tabs, view.active)}
        </span>
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
