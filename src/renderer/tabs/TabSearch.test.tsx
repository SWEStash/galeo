import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TabSearchResults } from '../../shared/tabs';
import { TabSearch } from './TabSearch';

let root: Root | undefined;
const say = vi.fn();

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
  say.mockReset();
});

const all: TabSearchResults = {
  query: '',
  open: [
    { id: 't1', name: 'README.md', detail: '~/acme' },
    { id: 't2', name: 'plan.md', detail: '~/acme/docs' },
  ],
  closed: [{ id: 'c1', name: 'notes.md', detail: '~/notes' }],
};

function stub(answer: (query: string) => Promise<TabSearchResults> = async (query) => (query ? { query, open: [all.open[1]!], closed: [] } : all)) {
  const search = vi.fn(answer);
  Object.defineProperty(window, 'galeo', { value: { tabs: { search } }, configurable: true });
  return search;
}

async function shown() {
  const onShow = vi.fn();
  const onReopen = vi.fn();
  const onClose = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<TabSearch onShow={onShow} onReopen={onReopen} onClose={onClose} say={say} />));
  await vi.waitFor(() => expect(document.querySelectorAll('[role="option"]')).toHaveLength(3));
  return { onShow, onReopen, onClose, input: document.querySelector('input')! };
}

/** A key press, down and up, as react-aria acts on some keys when they're released. */
const press = async (target: Element, key: string) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  await act(async () => target.dispatchEvent(event));
  await act(async () => target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true })));
  return event;
};

const type = async (input: HTMLInputElement, text: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

describe('TabSearch', () => {
  it('lists the open tabs, then the recently closed ones, with the field focused', async () => {
    stub();
    const { input } = await shown();
    expect(document.activeElement).toBe(input);
    const groups = [...document.querySelectorAll('[role="group"]')].map((group) => document.getElementById(group.getAttribute('aria-labelledby')!)?.textContent);
    expect(groups).toEqual(['Open tabs', 'Recently closed']);
    expect([...document.querySelectorAll('[role="option"]')].map((option) => option.textContent)).toEqual(['README.md~/acme', 'plan.md~/acme/docs', 'notes.md~/notes']);
    expect(document.querySelector('[data-testid="tab-search-count"]')?.textContent).toBe('3 tabs');
  });

  it('shows an open tab on Enter, and reopens a closed one', async () => {
    stub();
    const { input, onShow, onReopen, onClose } = await shown();
    await press(input, 'ArrowDown');
    await press(input, 'ArrowDown');
    await press(input, 'Enter');
    expect(onShow).toHaveBeenCalledWith('t2');
    expect(onClose).toHaveBeenCalledTimes(1);
    await press(input, 'ArrowDown');
    await press(input, 'Enter');
    expect(onReopen).toHaveBeenCalledWith('c1');
  });

  it('shows the first result when Enter comes with none highlighted', async () => {
    stub();
    const { input, onShow } = await shown();
    await press(input, 'Enter');
    expect(onShow).toHaveBeenCalledWith('t1');
  });

  it("follows what was typed, and acts on Enter only once main answered it", async () => {
    let answer: (results: TabSearchResults) => void = () => {};
    const search = stub((query) => (query ? new Promise((resolve) => (answer = resolve)) : Promise.resolve(all)));
    const { input, onShow } = await shown();
    await type(input, 'plan');
    expect(search).toHaveBeenLastCalledWith('plan');
    await press(input, 'Enter');
    expect(onShow).not.toHaveBeenCalled();
    await act(async () => answer({ query: 'plan', open: [all.open[1]!], closed: [] }));
    await vi.waitFor(() => expect(onShow).toHaveBeenCalledWith('t2'));
  });

  it('keeps Home and End for the caret', async () => {
    stub();
    const { input } = await shown();
    await press(input, 'ArrowDown');
    const highlighted = document.querySelector('[role="option"][data-focused]');
    for (const key of ['Home', 'End']) expect((await press(input, key)).defaultPrevented).toBe(false);
    expect(document.querySelector('[role="option"][data-focused]')).toBe(highlighted);
  });

  it('says when no tab matches', async () => {
    stub(async (query) => (query ? { query, open: [], closed: [] } : all));
    const { input } = await shown();
    await type(input, 'zzz');
    await vi.waitFor(() => expect(document.querySelector('[data-testid="tab-search-empty"]')?.textContent).toBe('No tab matches.'));
  });
});

describe('TabSearch when main fails', () => {
  it("says it couldn't search, and leaves no unhandled rejection", async () => {
    stub(async () => {
      throw new Error('boom');
    });
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<TabSearch onShow={vi.fn()} onReopen={vi.fn()} onClose={vi.fn()} say={say} />));
    await vi.waitFor(() => expect(say).toHaveBeenCalledWith("Couldn't search the tabs"));
  });
});
