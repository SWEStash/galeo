import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Command } from '../../shared/keymap';
import { CommandsProvider, useCommands } from '../commands/useCommands';
import { StatusBar } from './StatusBar';
import type { TabStatus, TabStore, TabsView } from './store';

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

const status = (change: Partial<TabStatus> = {}): TabStatus => ({
  state: 'ready',
  format: 'markdown',
  view: 'rendered',
  encoding: 'utf-8',
  lines: null,
  words: 120,
  follow: false,
  editing: false,
  dirty: false,
  options: { rendered: true, split: true, wrap: null, outline: false, followable: false },
  ...change,
});

const view = (shown: TabStatus, change: Partial<TabsView> = {}): TabsView => ({
  revision: 1,
  tabs: [{ id: 'a', path: '/d/a.md', format: 'markdown', folder: '/d' }],
  active: 'a',
  rendered: new Set(['a']),
  reads: new Map(),
  statuses: new Map([['a', shown]]),
  zooms: new Map(),
  widths: new Map(),
  reloaded: new Set(),
  updated: new Set(),
  crashed: new Set(),
  dragging: false,
  ...change,
});

const COMMANDS: Command[] = ['viewRendered', 'viewSource', 'viewSplit', 'toggleWrap', 'toggleOutline', 'toggleFollow', 'zoomReset', 'resetReaderWidth'];

function Recorder({ ran }: { ran: Command[] }) {
  useCommands(Object.fromEntries(COMMANDS.map((command) => [command, () => void ran.push(command)])));
  return null;
}

async function render(shown: TabsView) {
  const ran: Command[] = [];
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <CommandsProvider platform="linux">
        <Recorder ran={ran} />
        <StatusBar view={shown} store={{} as TabStore} say={vi.fn()}>
          {null}
        </StatusBar>
      </CommandsProvider>,
    ),
  );
  return ran;
}

const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"], [role="menuitemcheckbox"]')];
async function openViewMenu() {
  await act(async () => document.querySelector<HTMLButtonElement>('.status-view')!.click());
  await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull());
}

describe('the status bar (mouse paths review)', () => {
  it("names the view as a menu of the document's views, the shown one checked, and Outline where it applies", async () => {
    const ran = await render(view(status()));
    expect(document.querySelector('.status-view')!.getAttribute('aria-label')).toBe('View: Rendered');
    await openViewMenu();
    expect(items().map((item) => `${item.textContent}${item.getAttribute('aria-checked') === 'true' ? ' ✓' : ''}`)).toEqual(['Rendered ✓', 'Source', 'Split', 'Outline']);
    await act(async () => items()[2]!.click());
    expect(ran).toEqual(['viewSplit']);
  });

  it('offers Wrap in the source view, and only the views a format has', async () => {
    const ran = await render(view(status({ format: 'log', view: 'source', options: { rendered: false, split: false, wrap: true, outline: null, followable: true } })));
    await openViewMenu();
    expect(items().map((item) => `${item.textContent}${item.getAttribute('aria-checked') === 'true' ? ' ✓' : ''}`)).toEqual(['Source ✓', 'Wrap ✓']);
    await act(async () => items()[1]!.click());
    expect(ran).toEqual(['toggleWrap']);
  });

  it('shows Follow for a log as a toggle, pressed while it follows', async () => {
    const ran = await render(view(status({ format: 'log', view: 'source', follow: true, options: { rendered: false, split: false, wrap: false, outline: null, followable: true } })));
    const follow = document.querySelector<HTMLButtonElement>('[data-testid="status-follow"]')!;
    expect(follow.getAttribute('aria-pressed')).toBe('true');
    await act(async () => follow.click());
    expect(ran).toEqual(['toggleFollow']);
  });

  it('resets the zoom or the reader width on a click on either', async () => {
    const ran = await render(view(status(), { zooms: new Map([['a', 1.1]]), widths: new Map([['a', 96]]) }));
    expect(document.querySelector('[data-testid="status-follow"]')).toBeNull();
    const zoom = document.querySelector<HTMLButtonElement>('.status-zoom')!;
    const width = document.querySelector<HTMLButtonElement>('.status-width')!;
    expect([zoom.getAttribute('aria-label'), width.getAttribute('aria-label')]).toEqual(['Zoom 110%, reset', 'Reader width 96 ch, reset']);
    await act(async () => zoom.click());
    await act(async () => width.click());
    expect(ran).toEqual(['zoomReset', 'resetReaderWidth']);
  });
});
