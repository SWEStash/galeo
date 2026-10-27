import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentBanners } from './DocumentBanners';

type Props = ComponentProps<typeof DocumentBanners>;

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

const idle = { retry: vi.fn(), cancel: vi.fn() };
const base: Props = {
  ready: { state: 'ready', path: '/d/x', format: 'markdown', view: 'rendered', banner: null, text: '', encoding: 'utf-8', guessedEncoding: false, size: 0, version: 'v1' },
  view: 'rendered',
  renderAnyway: false,
  tabular: false,
  json: false,
  disk: null,
  diskActions: { 'disk-changed': [], 'disk-deleted': [], 'disk-unreadable': [] },
  render: { status: 'idle', html: null, outline: [], words: null, ...idle, renderAnyway: vi.fn() } as unknown as Props['render'],
  jsonTree: { status: 'idle', ...idle } as Props['jsonTree'],
  csvTable: { status: 'idle', ...idle, showAnyway: vi.fn() } as unknown as Props['csvTable'],
  shownTable: null,
  onShowRendered: vi.fn(),
};

/** Each banner shown, as its kind and its buttons. */
async function banners(props: Partial<Props>) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<DocumentBanners {...base} {...props} />));
  return [...container.querySelectorAll<HTMLElement>('[data-banner]')].map((banner) => [banner.dataset['banner'], [...banner.querySelectorAll('button')].map((button) => button.textContent)]);
}

const tooLarge = { ...base.ready, banner: 'too-large' as const };

describe('DocumentBanners', () => {
  it('offers Render anyway on a large file shown as source, Show as table for a table, and nothing for JSON', async () => {
    expect(await banners({ ready: tooLarge, view: 'source' })).toEqual([['too-large', ['Render anyway']]]);
    root!.unmount();
    expect(await banners({ ready: tooLarge, view: 'source', tabular: true })).toEqual([['too-large', ['Show as table']]]);
    root!.unmount();
    expect(await banners({ ready: tooLarge, view: 'source', json: true })).toEqual([['too-large', []]]);
    root!.unmount();
    expect(await banners({ ready: tooLarge, view: 'source', renderAnyway: true })).toEqual([]);
  });

  it.each([
    ['error', 'render-failed', ['Try again']],
    ['slow', 'render-slow', ['Render anyway']],
    ['cancelled', 'render-cancelled', ['Render anyway']],
    ['syntax', 'syntax-error', []],
  ])('says a render failed (%s) and offers its way back', async (reason, kind, buttons) => {
    const render = { ...base.render, status: 'failed', reason, syntax: null } as unknown as Props['render'];
    expect(await banners({ render })).toEqual([[kind, buttons]]);
  });

  it.each([
    ['error', 'render-failed', ['Try again']],
    ['slow', 'render-slow', ['Show as table']],
    ['cancelled', 'render-cancelled', ['Show as table']],
  ])('says a table failed (%s) and offers its way back', async (reason, kind, buttons) => {
    const csvTable = { ...base.csvTable, status: 'failed', reason } as unknown as Props['csvTable'];
    expect(await banners({ csvTable })).toEqual([[kind, buttons]]);
  });

  it.each([
    ['error', 'render-failed', ['Try again']],
    ['slow', 'render-slow', []],
    ['cancelled', 'render-cancelled', ['Try again']],
  ])('says a tree failed (%s) and offers its way back', async (reason, kind, buttons) => {
    const jsonTree = { ...base.jsonTree, status: 'failed', reason } as unknown as Props['jsonTree'];
    expect(await banners({ jsonTree })).toEqual([[kind, buttons]]);
  });

  it('counts the rows a capped table shows, not counting its header, outside the source view', async () => {
    const shownTable = { rows: 1_000_001, totalRows: 1_250_001 } as Props['shownTable'];
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<DocumentBanners {...base} shownTable={shownTable} />));
    expect(container.textContent).toBe('Showing 1,000,000 of 1,250,000 rows');
    root.unmount();
    expect(await banners({ shownTable, view: 'source' })).toEqual([]);
  });
});
