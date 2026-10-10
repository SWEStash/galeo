import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FindBar, type FindBarProps } from './FindBar';

let root: Root | undefined;

async function render(props: Partial<FindBarProps> = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const all: FindBarProps = {
    result: { current: 0, total: 0, capped: false },
    focusToken: 0,
    onQuery: vi.fn(),
    onStep: vi.fn(),
    onClose: vi.fn(),
    ...props,
  };
  await act(async () => root!.render(<FindBar {...all} />));
  return { container, props: all, input: container.querySelector('input')! };
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const key = (input: HTMLInputElement, init: KeyboardEventInit) =>
  act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  });

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

describe('FindBar', () => {
  it('is a labelled search region whose field takes focus when it opens', async () => {
    const { container, input } = await render();
    expect(container.querySelector('[role="search"]')?.getAttribute('aria-label')).toBe('Find in document');
    expect(input.getAttribute('aria-label')).toBe('Find in document');
    expect(document.activeElement).toBe(input);
  });

  it('searches as the user types', async () => {
    const { input, props } = await render();
    await type(input, 'plan');
    expect(props.onQuery).toHaveBeenLastCalledWith('plan', false);
  });

  it('steps with Enter and Shift+Enter, and closes with Esc', async () => {
    const { input, props } = await render();
    await key(input, { key: 'Enter' });
    await key(input, { key: 'Enter', shiftKey: true });
    await key(input, { key: 'Escape' });
    expect(vi.mocked(props.onStep).mock.calls).toEqual([[1], [-1]]);
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('announces "n of m", "No matches" and capped totals politely', async () => {
    const { container, input } = await render({ result: { current: 3, total: 12, capped: false } });
    const status = container.querySelector('[role="status"]')!;
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('');
    await type(input, 'x');
    expect(status.textContent).toBe('3 of 12');
    await act(async () =>
      root!.render(<FindBar result={{ current: 0, total: 0, capped: false }} focusToken={0} onQuery={vi.fn()} onStep={vi.fn()} onClose={vi.fn()} />),
    );
    expect(status.textContent).toBe('No matches');
    await act(async () =>
      root!.render(<FindBar result={{ current: 1, total: 10000, capped: true }} focusToken={0} onQuery={vi.fn()} onStep={vi.fn()} onClose={vi.fn()} />),
    );
    expect(status.textContent).toBe('1 of 10000+');
  });

  it('has named previous and next buttons and a match-case toggle', async () => {
    const { container, input, props } = await render();
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Match case', 'Previous match', 'Next match']);
    const matchCase = buttons[0]!;
    expect(matchCase.getAttribute('aria-pressed')).toBe('false');
    await type(input, 'Plan');
    await act(async () => matchCase.click());
    expect(matchCase.getAttribute('aria-pressed')).toBe('true');
    expect(props.onQuery).toHaveBeenLastCalledWith('Plan', true);
    await act(async () => buttons[2]!.click());
    await act(async () => buttons[1]!.click());
    expect(vi.mocked(props.onStep).mock.calls).toEqual([[1], [-1]]);
  });

  it('shows no replace row unless asked for one', async () => {
    const { container } = await render();
    expect(container.querySelector('input[aria-label="Replace with"]')).toBeNull();
  });

  it('replaces the current match on Enter or Replace, and every match on Replace all', async () => {
    const onReplace = vi.fn();
    const onReplaceAll = vi.fn();
    const { container } = await render({ replace: { onReplace, onReplaceAll, replaced: null } });
    const field = container.querySelector<HTMLInputElement>('input[aria-label="Replace with"]')!;
    await type(field, 'dog');
    await key(field, { key: 'Enter' });
    const button = (name: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === name)!;
    await act(async () => button('Replace').click());
    await act(async () => button('Replace all').click());
    expect(onReplace.mock.calls).toEqual([['dog'], ['dog']]);
    expect(onReplaceAll.mock.calls).toEqual([['dog']]);
  });

  it('announces how many matches Replace all replaced', async () => {
    const { container } = await render({ replace: { onReplace: vi.fn(), onReplaceAll: vi.fn(), replaced: 3 } });
    expect(container.querySelector('[role="status"]')!.textContent).toBe('Replaced 3');
  });

  it('takes focus again and selects its text when asked, as Ctrl+F does while open', async () => {
    const { input, props } = await render();
    await type(input, 'plan');
    input.blur();
    await act(async () => root!.render(<FindBar {...props} focusToken={1} />));
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 4]);
  });
});
