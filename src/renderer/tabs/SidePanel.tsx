import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TAB_PANEL_DEFAULT, TAB_PANEL_MAX } from '../../shared/settings';
import { panelDrag, shownPanelWidth, TAB_PANEL_COLLAPSED, widthForKey } from './panel-width';
import type { MarkerTip } from './TabStrip';

/** The side panel's state, kept by the window: the profile's width, and whether it is collapsed here. */
export interface PanelProps {
  /** The profile's width, in pixels. */
  width: number;
  collapsed: boolean;
  onCollapsed: (collapsed: boolean) => void;
  /** A gesture on the divider ended on this width: the profile keeps it. */
  onWidth: (width: number) => void;
}

/**
 * The collapsed marker the pointer or the keyboard is on. React Aria builds the tab list from a hidden
 * copy of the window's children, so a tab's handlers belong to that copy: the tip lives out here,
 * where both copies of the panel see it.
 */
const markerTip = (() => {
  let tip: MarkerTip | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => tip,
    set: (next: MarkerTip | null) => {
      if (next === tip) return;
      tip = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
})();

export const setMarkerTip = markerTip.set;

/**
 * Where the tab strip lives. With the tabs on top it adds nothing to the tab bar's layout. With the
 * tabs on the left (ADR-023) it is the side panel: under the title bar, as wide as the profile's
 * width (the window body keeps that room), with the divider that sets it. Dragging the divider under
 * 100 px collapses the panel to a strip of markers; out again expands it.
 */
export function StripHost({ panel, id, children }: { panel: PanelProps | null; id: string; children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const windowWidth = useWindowWidth();
  // What the divider shows while a gesture is under way, and after it until the profile's setting
  // comes back with the width it ended on: the setting changes when it ends.
  const [live, setLive] = useState<{ collapsed: boolean; width: number; ended?: boolean } | null>(null);
  useEffect(() => {
    if (live?.ended && panel && live.width === panel.width && live.collapsed === panel.collapsed) setLive(null);
  }, [live, panel?.width, panel?.collapsed]);
  const tip = useSyncExternalStore(markerTip.subscribe, markerTip.get);
  const stored = panel ? { collapsed: panel.collapsed, width: panel.width } : null;
  const shown = live ?? stored;
  const drawn = !shown ? 0 : shown.collapsed ? TAB_PANEL_COLLAPSED : shownPanelWidth(shown.width, windowWidth);

  // The window body keeps the panel's room beside the document.
  useLayoutEffect(() => {
    const window = hostRef.current?.closest<HTMLElement>('.window');
    window?.style.setProperty('--galeo-side-panel-width', `${drawn}px`);
  }, [drawn]);

  // Collapsing or expanding moves the markers the tip points at.
  const collapsed = shown?.collapsed ?? false;
  useEffect(() => markerTip.set(null), [collapsed]);

  if (!panel || !shown) {
    return (
      <div ref={hostRef} className="tab-strip-host">
        {children}
      </div>
    );
  }

  const end = (next: { collapsed: boolean; width: number }) => {
    const write = !next.collapsed && next.width !== panel.width;
    // Collapsing is this window's own state, at once; a new width shows until the setting has it.
    setLive(write ? { collapsed: false, width: next.width, ended: true } : null);
    if (next.collapsed !== panel.collapsed) panel.onCollapsed(next.collapsed);
    if (write) panel.onWidth(next.width);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const divider = event.currentTarget;
    divider.setPointerCapture(event.pointerId);
    const left = hostRef.current!.getBoundingClientRect().left;
    let next = { collapsed: panel.collapsed, width: panel.width };
    const move = (moved: globalThis.PointerEvent) => {
      const drag = panelDrag(moved.clientX - left);
      next = drag.collapsed ? { collapsed: true, width: panel.width } : drag;
      setLive(next);
    };
    const up = () => {
      divider.removeEventListener('pointermove', move);
      divider.removeEventListener('pointerup', up);
      divider.removeEventListener('pointercancel', up);
      end(next);
    };
    divider.addEventListener('pointermove', move);
    divider.addEventListener('pointerup', up);
    divider.addEventListener('pointercancel', up);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      panel.onCollapsed(!panel.collapsed);
      return;
    }
    // Collapsed, → expands it again; the other keys wait until it is.
    if (shown.collapsed) {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        panel.onCollapsed(false);
      }
      return;
    }
    const next = widthForKey(shown.width, event.key);
    if (next === null) return;
    event.preventDefault();
    setLive({ collapsed: false, width: next });
  };
  // A held key moves the divider on; the profile keeps where it was let go.
  const onKeyUp = () => {
    if (live && !live.ended) end(live);
  };

  return (
    <div ref={hostRef} id={id} className="tab-strip-host side-panel" data-testid="side-panel" data-collapsed={shown.collapsed || undefined} style={{ width: drawn }}>
      {children}
      <div
        className="panel-divider"
        data-testid="panel-divider"
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize tab panel"
        aria-controls={id}
        aria-valuemin={TAB_PANEL_COLLAPSED}
        aria-valuemax={TAB_PANEL_MAX}
        aria-valuenow={drawn}
        aria-valuetext={shown.collapsed ? 'collapsed' : `${drawn} pixels`}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onDoubleClick={() => {
          if (panel.collapsed) panel.onCollapsed(false);
          if (panel.width === TAB_PANEL_DEFAULT) return setLive(null);
          setLive({ collapsed: false, width: TAB_PANEL_DEFAULT, ended: true });
          panel.onWidth(TAB_PANEL_DEFAULT);
        }}
      />
      {/* On the page itself: the document beside the panel is drawn over anything the panel holds. */}
      {tip &&
        shown.collapsed &&
        hostRef.current?.isConnected &&
        createPortal(
          <div className="marker-tip" data-testid="marker-tip" aria-hidden="true" style={{ top: tip.top, left: drawn + 6 }}>
            {tip.text}
          </div>,
          document.body,
        )}
    </div>
  );
}

function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const resized = () => setWidth(window.innerWidth);
    window.addEventListener('resize', resized);
    return () => window.removeEventListener('resize', resized);
  }, []);
  return width;
}
