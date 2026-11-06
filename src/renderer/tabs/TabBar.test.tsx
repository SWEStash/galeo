import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Tabs } from 'react-aria-components';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TabView } from '../../shared/tabs';
import { TabBar } from './TabBar';
import type { TabStore, TabsView } from './store';

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

const TABS: TabView[] = [
  { id: 'a', path: '/home/me/acme/README.md', format: 'markdown', folder: '~/acme' },
  { id: 'b', path: '/home/me/docs/plan.md', format: 'markdown', folder: '~/docs' },
];

const view: TabsView = {
  revision: 1,
  tabs: TABS,
  active: 'b',
  rendered: new Set(['b']),
  reads: new Map(),
  statuses: new Map(),
  zooms: new Map(),
  widths: new Map(),
  reloaded: new Set(),
  updated: new Set(),
  crashed: new Set(),
  dragging: false,
};

const store = { close: vi.fn(), move: vi.fn(), adopt: vi.fn(), draggedHere: vi.fn(), dragStarted: vi.fn(), dragEnded: vi.fn() } as unknown as TabStore;

async function bar(left: boolean) {
  const actions = { onOpenFile: vi.fn(), onOverview: vi.fn(), onSearchTabs: vi.fn(), onCommands: vi.fn() };
  const panel = left ? { width: 220, collapsed: false, onCollapsed: vi.fn(), onWidth: vi.fn() } : null;
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <Tabs orientation={left ? 'vertical' : 'horizontal'} selectedKey="b">
        <TabBar view={view} store={store} start={<span data-testid="chip" />} panel={panel} {...actions} />
      </Tabs>,
    ),
  );
  return actions;
}

const byId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
/** The bar's own children by test id (or class), in order. */
const order = () => [...byId(document.querySelector('[data-testid="title-bar"]') ? 'title-bar' : 'tab-bar').children].map((child) => (child as HTMLElement).dataset['testid'] ?? child.className);

describe('TabBar', () => {
  it.each([
    ['tab-overview-button', 'Tab overview (Ctrl+Shift+E)', 'onOverview'],
    ['tab-search-button', 'Search tabs (Ctrl+Shift+A)', 'onSearchTabs'],
    ['commands-button', 'Commands (Ctrl+Shift+P)', 'onCommands'],
    ['tab-new', 'Open file… (Ctrl+P)', 'onOpenFile'],
  ] as const)('%s is named "%s" and runs its command', async (id, name, action) => {
    const actions = await bar(false);
    const button = byId(id);
    expect(button.getAttribute('aria-label')).toBe(name);
    expect(button.title).toBe(name);
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    await act(async () => button.click());
    expect(actions[action]).toHaveBeenCalledOnce();
  });

  it('with the tabs on top: + follows the last tab inside the strip, then the grip, then the tools', async () => {
    await bar(false);
    const strip = document.querySelector('.tab-strip')!;
    expect(strip.lastElementChild).toBe(byId('tab-new'));
    expect(order()).toEqual(['chip', 'tab-strip-host', 'window-grip', 'bar-tools']);
    expect([...byId('bar-tools').children].map((button) => (button as HTMLElement).dataset['testid'])).toEqual(['tab-overview-button', 'tab-search-button', 'commands-button']);
  });

  it('with the tabs on the left: the panel button, the chip and + start the title bar; the tools end it', async () => {
    await bar(true);
    expect(order()).toEqual(['panel-toggle', 'chip', 'tab-new', 'side-panel', 'title-bar-text', 'window-grip', 'bar-tools']);
    expect(document.querySelector('.tab-strip > [data-testid="tab-new"]')).toBeNull();
  });
});
