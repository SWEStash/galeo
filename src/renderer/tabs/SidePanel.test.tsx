import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Tabs } from 'react-aria-components';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TabView } from '../../shared/tabs';
import { TabBar } from './TabBar';
import type { TabStatus, TabStore, TabsView } from './store';

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

const TABS: TabView[] = [
  { id: 'a', path: '/home/me/acme/README.md', format: 'markdown', folder: '~/acme' },
  { id: 'b', path: '/home/me/docs/plan.md', format: 'markdown', folder: '~/docs' },
  { id: 's', path: '', kind: 'settings' },
];

function viewOf(change: Partial<TabsView> = {}): TabsView {
  return {
    revision: 1,
    tabs: TABS,
    active: 'b',
    rendered: new Set(['b']),
    reads: new Map(),
    statuses: new Map([['b', { dirty: true, editing: true } as TabStatus]]),
    zooms: new Map(),
    widths: new Map(),
    reloaded: new Set(),
    crashed: new Set(),
    dragging: false,
    ...change,
  };
}

const store = { close: vi.fn(), move: vi.fn(), adopt: vi.fn(), draggedHere: vi.fn(), dragStarted: vi.fn(), dragEnded: vi.fn() } as unknown as TabStore;

async function shown({ collapsed = false, width = 220, view = viewOf() } = {}) {
  const onCollapsed = vi.fn();
  const onWidth = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <Tabs orientation="vertical" selectedKey={view.active ?? ''}>
        <TabBar view={view} store={store} panel={{ width, collapsed, onCollapsed, onWidth }} />
      </Tabs>,
    ),
  );
  return { onCollapsed, onWidth };
}

const panel = () => document.querySelector<HTMLElement>('[data-testid="side-panel"]')!;
const divider = () => document.querySelector<HTMLElement>('[data-testid="panel-divider"]')!;
const tabs = () => [...document.querySelectorAll<HTMLElement>('[role="tab"]')];

async function key(target: HTMLElement, key: string) {
  await act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
  await act(async () => target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true })));
}

async function drag(points: number[]) {
  const target = divider();
  target.setPointerCapture = () => {};
  const event = (type: string, clientX: number) => new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX });
  await act(async () => target.dispatchEvent(event('pointerdown', points[0]!)));
  for (const at of points.slice(1)) await act(async () => target.dispatchEvent(event('pointermove', at)));
  return {
    up: () => act(async () => target.dispatchEvent(event('pointerup', points.at(-1)!))),
  };
}

describe('the side panel (ADR-023)', () => {
  it('lists the tabs top to bottom, each with its name, its folder below and its full path as the tooltip', async () => {
    await shown();
    expect(document.querySelector('[role="tablist"]')?.getAttribute('aria-orientation')).toBe('vertical');
    expect(tabs().map((tab) => tab.querySelector('.tab-label')?.textContent)).toEqual(['README.md', 'plan.md', 'Settings']);
    expect(tabs().map((tab) => tab.querySelector('.tab-folder')?.textContent ?? null)).toEqual([', ~/acme', ', ~/docs', null]);
    expect(tabs()[0]!.querySelector('[title]')?.getAttribute('title')).toBe('/home/me/acme/README.md');
    expect(tabs()[1]!.textContent).toContain('unsaved changes');
    expect(panel().style.width).toBe('220px');
  });

  it("shows the shown tab's name and folder in the title bar, for the eye only", async () => {
    await shown();
    const text = document.querySelector('[data-testid="title-bar-text"]')!;
    expect(text.textContent).toBe('plan.md — ~/docs');
    expect(text.getAttribute('aria-hidden')).toBe('true');
    const toggle = document.querySelector('[data-testid="panel-toggle"]')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Collapse tab panel');
  });

  it('collapses to a marker per tab: its letter and one mark on show, its whole name for screen readers', async () => {
    await shown({ collapsed: true });
    expect(panel().dataset['collapsed']).toBe('true');
    expect(panel().style.width).toBe('32px');
    expect(tabs().map((tab) => tab.querySelector('.tab-marker')?.textContent)).toEqual(['R', 'P●', '⚙']);
    expect(tabs()[1]!.textContent).toContain('plan.md, ~/docs');
    expect(tabs()[1]!.textContent).toContain('edit mode');
    expect(document.querySelector('[data-testid="panel-toggle"]')!.getAttribute('aria-label')).toBe('Expand tab panel');
  });

  it("shows a collapsed marker's tooltip beside it while the pointer is on it", async () => {
    await shown({ collapsed: true });
    const marker = tabs()[1]!.querySelector('.tab-grab')!;
    await act(async () => marker.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, relatedTarget: document.body })));
    expect(document.querySelector('[data-testid="marker-tip"]')?.textContent).toBe('plan.md — ~/docs, edit mode, unsaved changes');
    await act(async () => marker.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body })));
    expect(document.querySelector('[data-testid="marker-tip"]')).toBeNull();
  });

  it('is a window splitter: arrows widen and narrow it, Home resets it, each written once when the key is let go', async () => {
    const { onWidth } = await shown();
    expect(divider().getAttribute('role')).toBe('separator');
    expect(divider().getAttribute('aria-valuetext')).toBe('220 pixels');
    await key(divider(), 'ArrowRight');
    expect(onWidth).toHaveBeenCalledTimes(1);
    expect(onWidth).toHaveBeenLastCalledWith(236);
    await key(divider(), 'Home');
    expect(onWidth).toHaveBeenCalledTimes(1);
    await act(async () => root!.unmount());
    const again = await shown({ width: 300 });
    await key(divider(), 'Home');
    expect(again.onWidth).toHaveBeenLastCalledWith(220);
  });

  it('collapses and expands with Enter, and expands with → when collapsed', async () => {
    const open = await shown();
    await key(divider(), 'Enter');
    expect(open.onCollapsed).toHaveBeenLastCalledWith(true);
    await act(async () => root!.unmount());
    const closed = await shown({ collapsed: true });
    expect(divider().getAttribute('aria-valuetext')).toBe('collapsed');
    await key(divider(), 'ArrowRight');
    expect(closed.onCollapsed).toHaveBeenLastCalledWith(false);
  });

  it('follows a divider drag live, and the profile keeps the width it ends on', async () => {
    const { onWidth, onCollapsed } = await shown();
    const gesture = await drag([220, 260, 300.4]);
    expect(panel().style.width).toBe('300px');
    expect(onWidth).not.toHaveBeenCalled();
    await gesture.up();
    expect(onWidth).toHaveBeenCalledExactlyOnceWith(300);
    expect(onCollapsed).not.toHaveBeenCalled();
    // Until the profile's setting comes back with it, the panel keeps the width it was let go at.
    expect(panel().style.width).toBe('300px');
  });

  it('collapses when dragged under 100 px, keeping the width, and expands when dragged out again', async () => {
    const open = await shown();
    const inward = await drag([220, 60]);
    expect(panel().dataset['collapsed']).toBe('true');
    await inward.up();
    expect(open.onCollapsed).toHaveBeenCalledExactlyOnceWith(true);
    expect(open.onWidth).not.toHaveBeenCalled();
    await act(async () => root!.unmount());

    const closed = await shown({ collapsed: true });
    const outward = await drag([32, 180]);
    expect(panel().style.width).toBe('180px');
    await outward.up();
    expect(closed.onCollapsed).toHaveBeenCalledExactlyOnceWith(false);
    expect(closed.onWidth).toHaveBeenCalledExactlyOnceWith(180);
  });

  it('resets to the default width on a double-click', async () => {
    const { onWidth } = await shown({ width: 400 });
    await act(async () => divider().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(onWidth).toHaveBeenCalledExactlyOnceWith(220);
  });

  it('draws narrower in a window without room for it and 320 px of document, keeping the setting', async () => {
    vi.stubGlobal('innerWidth', 600);
    await shown({ width: 480 });
    expect(panel().style.width).toBe('280px');
  });
});
