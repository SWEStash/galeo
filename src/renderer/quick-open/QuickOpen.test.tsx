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
  sections: [{ kind: 'tabs', title: 'Open tabs', entries: [{ id: 'pick-1', name: 'README.md', detail: '~/acme', fill: '~/acme/README.md' }] }],
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
        ? { token: 't1', query, sections: [{ kind: 'repo', title: 'In acme (git root)', walking: true, entries: [{ id: 'pick-2', name: '.local/plans/plan.md', detail: '', fill: '~/acme/.local/plans/plan.md' }] }] }
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
      answer({ token: 't1', query: 'notes', sections: [{ kind: 'repo', title: 'In acme', entries: [{ id: 'pick-notes', name: 'notes.md', detail: '', fill: '~/acme/notes.md' }] }] }),
    );
    await vi.waitFor(() => expect(api.open).toHaveBeenCalledWith('t1', 'pick-notes', false));
    expect(onClose).toHaveBeenCalled();
  });

  it('leaves Home and End to the field: the highlighted result stays and the caret may move', async () => {
    stub();
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<QuickOpen platform="linux" onClose={() => {}} say={() => {}} />));
    await vi.waitFor(() => expect(document.querySelector('[role="option"]')?.textContent).toContain('README.md'));
    const input = document.querySelector('input')!;
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
    const highlighted = input.getAttribute('aria-activedescendant');
    expect(highlighted).toBeTruthy();
    for (const key of ['Home', 'End']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      await act(async () => input.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(false);
      expect(input.getAttribute('aria-activedescendant')).toBe(highlighted);
    }
  });

  async function shown() {
    const api = stub();
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<QuickOpen platform="linux" onClose={() => {}} say={() => {}} />));
    await vi.waitFor(() => expect(document.querySelector('[role="option"]')?.textContent).toContain('README.md'));
    return { api, input: document.querySelector('input')! };
  }
  const press = async (target: Element, key: string) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    await act(async () => target.dispatchEvent(event));
    return event;
  };

  it('Tab fills the field with the highlighted result’s path instead of opening it, and says so', async () => {
    const { api, input } = await shown();
    await press(input, 'ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBeTruthy();
    await press(input, 'Tab');
    await vi.waitFor(() => expect(input.value).toBe('~/acme/README.md'));
    expect(document.activeElement).toBe(input);
    expect(api.query).toHaveBeenLastCalledWith('t1', '~/acme/README.md');
    expect(api.open).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="quick-open-filled"]')?.textContent).toBe('Filled ~/acme/README.md');
  });

  it('Tab with no result highlighted leaves the field alone', async () => {
    const { api, input } = await shown();
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    await press(input, 'Tab');
    expect(input.value).toBe('');
    expect(api.open).not.toHaveBeenCalled();
  });

  it('each result’s fill icon fills its path on click without opening it, hidden from screen readers', async () => {
    const { api, input } = await shown();
    const icon = document.querySelector('[role="option"] .quick-open-fill')!;
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.getAttribute('tabindex')).toBeNull();
    await act(async () => {
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) icon.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
      icon.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    await vi.waitFor(() => expect(input.value).toBe('~/acme/README.md'));
    expect(api.open).not.toHaveBeenCalled();
  });

  it('describes each result with the key that fills it', async () => {
    await shown();
    const option = document.querySelector('[role="option"]')!;
    const hint = document.getElementById(option.getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toBe('Tab fills in its path');
    // The name stays the file and its folder.
    expect(document.getElementById(option.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('README.md~/acme');
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
