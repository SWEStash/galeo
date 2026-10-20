import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuickOpenResults } from '../../shared/quick-open';
import { QuickOpen } from './QuickOpen';

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

const results = (query: string): QuickOpenResults => ({
  token: 't1',
  query,
  sections: [{ kind: 'tabs', title: 'Open tabs', entries: [{ id: 'pick-1', name: 'README.md', detail: '~/acme' }] }],
});

function stub() {
  const api = {
    start: vi.fn().mockResolvedValue({ token: 't1', scope: 'acme (git root)' }),
    query: vi.fn(async (_token: string, query: string) => results(query)),
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    onResults: vi.fn(() => () => {}),
  };
  Object.defineProperty(window, 'galeo', { value: { quickOpen: api }, configurable: true });
  return api;
}

describe('QuickOpen', () => {
  it("lists main's results in their sections, with the field focused", async () => {
    stub();
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<QuickOpen platform="linux" onClose={() => {}} say={() => {}} />));
    await vi.waitFor(() => expect(document.querySelector('[role="option"]')?.textContent).toContain('README.md'));
    expect(document.activeElement?.getAttribute('role')).toBe('combobox');
    expect(document.querySelector('[role="group"]')?.getAttribute('aria-labelledby')).toBeTruthy();
  });

  it('follows the results as the query changes, under StrictMode', async () => {
    const api = stub();
    api.query.mockImplementation(async (_token: string, query: string) =>
      query
        ? { token: 't1', query, sections: [{ kind: 'repo', title: 'In acme (git root)', walking: true, entries: [{ id: 'pick-2', name: '.local/plans/plan.md', detail: '' }] }] }
        : results(query),
    );
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root!.render(
        <StrictMode>
          <QuickOpen platform="linux" onClose={() => {}} say={() => {}} />
        </StrictMode>,
      ),
    );
    await vi.waitFor(() => expect(document.querySelector('[role="option"]')?.textContent).toContain('README.md'));
    const input = document.querySelector('input')!;
    await act(async () => {
      input.focus();
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, 'plan');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await vi.waitFor(() => expect(document.querySelector('[role="option"]')?.textContent).toContain('plan.md'));
    expect(document.querySelector('[role="group"]')?.textContent).toContain('searching');
  });

  it("opens the first result of what was typed when Enter comes before main's answer to it", async () => {
    const api = stub();
    let answer: (results: QuickOpenResults) => void = () => {};
    api.query.mockImplementation((_token: string, query: string) =>
      query ? new Promise<QuickOpenResults>((resolve) => (answer = resolve)) : Promise.resolve(results(query)),
    );
    const onClose = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<QuickOpen platform="linux" onClose={onClose} say={() => {}} />));
    await vi.waitFor(() => expect(document.querySelector('[role="option"]')?.textContent).toContain('README.md'));
    const input = document.querySelector('input')!;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, 'notes');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    // The list still shows the answer to the empty query: nothing opens from it.
    expect(api.open).not.toHaveBeenCalled();
    await act(async () =>
      answer({ token: 't1', query: 'notes', sections: [{ kind: 'repo', title: 'In acme', entries: [{ id: 'pick-notes', name: 'notes.md', detail: '' }] }] }),
    );
    await vi.waitFor(() => expect(api.open).toHaveBeenCalledWith('t1', 'pick-notes', false));
    expect(onClose).toHaveBeenCalled();
  });

  it('says so when main refuses to open the chosen file', async () => {
    const api = stub();
    api.open.mockRejectedValue(new Error("Error invoking remote method 'quickOpen.open': Error: not offered"));
    const say = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<QuickOpen platform="linux" onClose={() => {}} say={say} />));
    await vi.waitFor(() => expect(document.querySelector('[role="option"]')?.textContent).toContain('README.md'));
    await act(async () => document.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    await vi.waitFor(() => expect(say).toHaveBeenCalledWith("Couldn't open README.md"));
  });
});
