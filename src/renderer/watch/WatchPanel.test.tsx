import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WatchEntry, WatchState } from '../../shared/watch';
import { WatchPanel } from './WatchPanel';

let root: Root | undefined;
const api = { open: vi.fn(), openAllNew: vi.fn(), stop: vi.fn() };

beforeEach(() => {
  for (const mock of Object.values(api)) mock.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(window, 'galeo', { value: { watch: api }, configurable: true });
});

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const entry = (id: string, overrides: Partial<WatchEntry> = {}): WatchEntry => ({ id, name: `${id}.md`, folder: '', kind: 'new', at: Date.UTC(2026, 10, 8, 14, 12), opened: false, ...overrides });
const state = (overrides: Partial<WatchState> = {}): WatchState => ({ shown: '~/acme/reports', name: 'reports', status: 'watching', polling: false, panel: true, entries: [], truncated: false, ...overrides });

async function render(props: Partial<Parameters<typeof WatchPanel>[0]> = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const handlers = { onClose: vi.fn(), say: vi.fn() };
  const draw = (next: Partial<Parameters<typeof WatchPanel>[0]>) => act(async () => root!.render(<WatchPanel state={state()} platform="linux" {...handlers} {...props} {...next} />));
  await draw({});
  return { container, ...handlers, draw };
}

const options = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[role="option"]')];
const press = async (target: Element, key: string, init: KeyboardEventInit = {}) => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
    target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true, ...init }));
  });
};

describe('WatchPanel (UX F21)', () => {
  it('is a landmark that names the folder, and says so while nothing arrived', async () => {
    const { container } = await render();
    const panel = container.querySelector('aside')!;
    expect(panel.getAttribute('aria-label')).toBe('Watched folder');
    expect(container.querySelector('[data-testid="watch-folder"]')!.textContent).toBe('~/acme/reports');
    expect(container.querySelector('[data-testid="watch-empty"]')!.textContent).toMatch(/^Nothing new yet/);
    expect(container.querySelector<HTMLButtonElement>('[data-testid="watch-open-all"]')!.disabled).toBe(true);
  });

  it('lists entries newest first, each read with its kind, time and folder in words', async () => {
    const entries = [entry('review-auth', { folder: 'reviews' }), entry('plan', { kind: 'changed', opened: true })];
    const { container } = await render({ state: state({ entries }) });
    const [first, second] = options(container);
    expect(first!.getAttribute('aria-label')).toMatch(/^review-auth\.md, new, \d{1,2}:\d\d.*, in reviews$/);
    expect(second!.getAttribute('aria-label')).toMatch(/^plan\.md, changed, opened, \d{1,2}:\d\d.*, in the folder itself$/);
    expect(first!.textContent).toContain('reviews/');
    expect(second!.textContent).toContain('./');
    expect(second!.dataset['opened']).toBe('true');
    expect(container.querySelector('[role="listbox"]')!.getAttribute('aria-label')).toBe('Files in the watched folder');
  });

  it('opens with Enter, in a new window with Ctrl+Enter or a middle click', async () => {
    const { container } = await render({ state: state({ entries: [entry('a'), entry('b')] }) });
    const [a, b] = options(container);
    await act(async () => a!.focus());
    await press(a!, 'Enter');
    expect(api.open).toHaveBeenLastCalledWith('a', false);
    await act(async () => b!.focus());
    await press(b!, 'Enter', { ctrlKey: true });
    expect(api.open).toHaveBeenLastCalledWith('b', true);
    await act(async () => a!.dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true })));
    expect(api.open).toHaveBeenLastCalledWith('a', true);
  });

  it('takes the focus on its first entry when asked, and closes with Esc', async () => {
    const { container, onClose } = await render({ state: state({ entries: [entry('a')] }), autoFocus: true });
    expect(document.activeElement).toBe(options(container)[0]);
    await press(document.activeElement!, 'Escape');
    expect(onClose).toHaveBeenCalled();
  });

  it('says when the folder is gone or unreadable, when it is polled, and when older entries went', async () => {
    const { container, draw } = await render({ state: state({ status: 'missing', entries: [entry('a')] }) });
    expect(container.querySelector('[data-testid="watch-state"]')!.textContent).toBe('The folder is gone.');
    expect(options(container)).toHaveLength(1);
    await draw({ state: state({ status: 'denied' }) });
    expect(container.querySelector('[data-testid="watch-state"]')!.textContent).toBe("galeo can't read this folder.");
    await draw({ state: state({ polling: true, truncated: true, entries: [entry('a')] }) });
    expect(container.textContent).toContain('checked every few seconds');
    expect(container.textContent).toContain('Showing the newest 200');
  });

  it('opens all new and stops watching from its footer', async () => {
    const { container } = await render({ state: state({ entries: [entry('a')] }) });
    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="watch-open-all"]')!.click());
    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="watch-stop"]')!.click());
    expect(api.openAllNew).toHaveBeenCalledOnce();
    expect(api.stop).toHaveBeenCalledOnce();
  });

  it('announces what arrives, not what was there, at most once a second', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const { container, draw } = await render({ state: state({ entries: [entry('old')] }) });
    const said = () => container.querySelector('[data-testid="watch-announcement"]')!.textContent;
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(said()).toBe('');
    await draw({ state: state({ entries: [entry('review'), entry('old')] }) });
    await act(async () => vi.advanceTimersByTime(0));
    expect(said()).toBe('review.md, new');
    await draw({ state: state({ entries: [entry('c'), entry('b'), entry('review'), entry('old')] }) });
    await act(async () => vi.advanceTimersByTime(500));
    expect(said()).toBe('review.md, new');
    await act(async () => vi.advanceTimersByTime(500));
    expect(said()).toBe('2 files arrived, the newest c.md');
  });
});
