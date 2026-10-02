import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentView } from './DocumentView';

// The editor module arrives only when the test opens the gate.
const gate = vi.hoisted(() => {
  let open = () => {};
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open: () => open() };
});
vi.mock('./source-view', async (importOriginal) => {
  await gate.opened;
  return importOriginal();
});

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

const props = { source: { text: '# src', language: 'markdown' as const }, rendered: { html: '<p>r</p>' }, wrap: false, scheme: 'light' as const };

describe('DocumentView with the editor not loaded yet', () => {
  it('keeps the rendered view shown until the editor has loaded, then switches', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<DocumentView {...props} view="rendered" />));
    await act(async () => root!.render(<DocumentView {...props} view="source" />));
    const view = container.querySelector<HTMLElement>('[data-testid="document"]')!;
    const shadow = view.shadowRoot!;
    expect(shadow.querySelector('.cm-editor')).toBeNull();
    expect(shadow.querySelector('article')?.hidden).toBe(false);
    expect(view.dataset['view']).toBe('rendered');

    await act(async () => gate.open());

    await vi.waitFor(() => expect(shadow.querySelector('.cm-editor')).not.toBeNull(), { timeout: 5_000 });
    expect(shadow.querySelector('article')?.hidden).toBe(true);
    expect(view.dataset['view']).toBe('source');
  });
});
