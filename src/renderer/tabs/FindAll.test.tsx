import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FindAllResult } from '../../shared/find';
import { editors, type Editor } from '../edit/editors';
import { FindAll } from './FindAll';

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
  editors.clear();
  say.mockReset();
});

const tabs = [
  { id: 't1', path: '/home/u/acme/plan.md', folder: '~/acme' },
  { id: 't2', path: '/home/u/var/log.txt', folder: '~/var' },
  { id: 't3', path: '/home/u/old/gone.md', folder: '~/old' },
];

const hit = (line: number, match = 'plan') => ({ line, before: 'the ', match, after: ' here' });
const answer: FindAllResult = {
  kind: 'done',
  tabs: [
    { id: 't1', found: { count: 2, capped: false, hits: [hit(1), hit(4)] } },
    { id: 't2', found: { count: 25, capped: false, hits: [hit(9)] } },
    { id: 't3', skipped: 'missing' },
  ],
};

const say = vi.fn();

function stub(reply: (query: string, options: { caseSensitive: boolean }) => Promise<FindAllResult> = async (query) => (query ? answer : { kind: 'done', tabs: [] })) {
  const findAll = vi.fn(reply);
  Object.defineProperty(window, 'galeo', { value: { documents: { findAll } }, configurable: true });
  return findAll;
}

async function shown() {
  const onChoose = vi.fn();
  const onClose = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<FindAll tabs={tabs} onChoose={onChoose} onClose={onClose} say={say} />));
  return { onChoose, onClose, input: document.querySelector<HTMLInputElement>('input')! };
}

const press = async (target: Element, key: string) => {
  await act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
  await act(async () => target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true })));
};

const type = async (input: HTMLInputElement, text: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

const status = () => document.querySelector('[data-testid="find-all-status"]')?.textContent;
const options = () => [...document.querySelectorAll('[role="option"]')].map((option) => option.textContent);

describe('FindAll', () => {
  it("lists each tab's matches under its name, after handing main the unsaved text", async () => {
    const findAll = stub();
    const keepNow = vi.fn();
    editors.set('t1', { keepNow } as unknown as Editor);
    const { input } = await shown();
    expect(document.activeElement).toBe(input);
    expect(status()).toBe('Type at least 2 characters');
    await type(input, 'plan');
    await vi.waitFor(() => expect(options()).toHaveLength(4));
    expect(keepNow).toHaveBeenCalled();
    expect(findAll).toHaveBeenLastCalledWith('plan', { caseSensitive: false });
    const groups = [...document.querySelectorAll('[role="group"]')].map((group) => document.getElementById(group.getAttribute('aria-labelledby')!)?.textContent);
    expect(groups).toEqual(['plan.md — ~/acme · 2 matches', 'log.txt — ~/var · 25 matches, first 1 shown', 'Not searched']);
    expect(options()).toEqual(['1the plan here', '4the plan here', '9the plan here', 'gone.md — ~/old: file not found']);
    expect(status()).toBe('27 matches in 2 tabs');
  });

  it('opens the chosen tab with its find bar on the match', async () => {
    stub();
    const { input, onChoose, onClose } = await shown();
    await type(input, 'plan');
    await vi.waitFor(() => expect(options()).toHaveLength(4));
    await press(input, 'ArrowDown');
    await press(input, 'ArrowDown');
    await press(input, 'Enter');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith('t1', { query: 'plan', caseSensitive: false, line: 4 });
  });

  it('opens the first match on Enter with none highlighted, even before the answer', async () => {
    let release: () => void = () => {};
    const findAll = stub(async (query) => {
      if (!query) return { kind: 'done', tabs: [] };
      await new Promise<void>((resolve) => (release = resolve));
      return answer;
    });
    const { input, onChoose } = await shown();
    await type(input, 'plan');
    await press(input, 'Enter');
    expect(onChoose).not.toHaveBeenCalled();
    expect(status()).toBe('Searching…');
    await vi.waitFor(() => expect(findAll).toHaveBeenCalledWith('plan', { caseSensitive: false }));
    await act(async () => release());
    await vi.waitFor(() => expect(onChoose).toHaveBeenCalledWith('t1', { query: 'plan', caseSensitive: false, line: 1 }));
  });

  it('shows a tab it could not search, without a match to land on', async () => {
    stub();
    const { input, onChoose } = await shown();
    await type(input, 'plan');
    await vi.waitFor(() => expect(options()).toHaveLength(4));
    for (let i = 0; i < 4; i++) await press(input, 'ArrowDown');
    await press(input, 'Enter');
    expect(onChoose).toHaveBeenCalledWith('t3', null);
  });

  it('searches again with Match case, and says when nothing matches', async () => {
    const findAll = stub(async (query, { caseSensitive }) => (caseSensitive ? { kind: 'done', tabs: [] } : query ? answer : { kind: 'done', tabs: [] }));
    const { input } = await shown();
    await type(input, 'plan');
    await vi.waitFor(() => expect(options()).toHaveLength(4));
    const matchCase = document.querySelector<HTMLButtonElement>('button[aria-label="Match case"]')!;
    await act(async () => matchCase.click());
    expect(matchCase.getAttribute('aria-pressed')).toBe('true');
    await vi.waitFor(() => expect(status()).toBe('No matches'));
    expect(findAll).toHaveBeenLastCalledWith('plan', { caseSensitive: true });
  });

  it('ignores an answer to a search that a newer one stopped, and stops its search on close', async () => {
    const findAll = stub(async (query) => (query === 'pl' ? { kind: 'superseded' } : query ? answer : { kind: 'done', tabs: [] }));
    const { input } = await shown();
    await type(input, 'pl');
    await vi.waitFor(() => expect(findAll).toHaveBeenCalledWith('pl', { caseSensitive: false }));
    expect(status()).toBe('Searching…');
    await type(input, 'plan');
    await vi.waitFor(() => expect(options()).toHaveLength(4));
    act(() => root!.unmount());
    root = undefined;
    expect(findAll).toHaveBeenLastCalledWith('', { caseSensitive: false });
  });
});

describe('FindAll when main fails', () => {
  it("says it couldn't search, and leaves no unhandled rejection", async () => {
    stub(async () => {
      throw new Error('boom');
    });
    const { input } = await shown();
    await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'needle');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
    await vi.waitFor(() => expect(say).toHaveBeenCalledWith("Couldn't search the tabs"));
  });
});
