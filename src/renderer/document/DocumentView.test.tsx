import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentView } from './DocumentView';

let root: Root | undefined;

async function render(element: React.ReactNode): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

const props = { source: { text: '# src', language: 'markdown' as const }, view: 'rendered' as const, wrap: false };

const shadowOf = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-testid="document"]')!.shadowRoot!;

describe('DocumentView', () => {
  it('mounts one document under StrictMode, whose effects run twice', async () => {
    const container = await render(
      <StrictMode>
        <DocumentView {...props} rendered={{ html: '<p>once</p>' }} scheme="light" />
      </StrictMode>,
    );
    const shadow = shadowOf(container);
    expect(shadow.querySelectorAll('article')).toHaveLength(1);
    expect(shadow.querySelector('article')?.innerHTML).toBe('<p>once</p>');
  });

  it('updates the content and the scheme in place', async () => {
    const container = await render(<DocumentView {...props} rendered={{ html: '<p>a</p>' }} scheme="light" />);
    const shadow = shadowOf(container);
    await act(async () => root!.render(<DocumentView {...props} rendered={{ html: '<p>b</p>' }} scheme="dark" />));
    expect(shadowOf(container)).toBe(shadow);
    expect(shadow.querySelector('article')?.innerHTML).toBe('<p>b</p>');
    expect(container.querySelector<HTMLElement>('[data-testid="document"]')?.dataset['scheme']).toBe('dark');
  });

  it('mounts one source editor under StrictMode and keeps it across view switches', async () => {
    const container = await render(
      <StrictMode>
        <DocumentView {...props} view="source" rendered={null} scheme="light" />
      </StrictMode>,
    );
    const shadow = shadowOf(container);
    // The editor loads the first time a source view shows (a slow runner can take over a second).
    await vi.waitFor(() => expect(shadow.querySelectorAll('.cm-editor')).toHaveLength(1), { timeout: 5_000 });
    const editor = shadow.querySelector('.cm-editor');
    await act(async () => root!.render(<DocumentView {...props} view="rendered" rendered={{ html: '<p>r</p>' }} scheme="light" />));
    await act(async () => root!.render(<DocumentView {...props} view="source" rendered={{ html: '<p>r</p>' }} scheme="light" />));
    expect(shadow.querySelector('.cm-editor')).toBe(editor);
  });

  it('creates no editor until the source view is shown', async () => {
    const container = await render(<DocumentView {...props} rendered={{ html: '<p>x</p>' }} scheme="light" />);
    expect(shadowOf(container).querySelector('.cm-editor')).toBeNull();
  });

  it('asks main for each local image and loads it only from the URL main grants', async () => {
    const resolve = vi.fn(async (src: string) =>
      src === 'ok.png' ? ({ kind: 'image', url: 'galeo://file/abc' } as const) : ({ kind: 'refused', reason: 'missing' } as const),
    );
    const html = '<p><img data-galeo-src="ok.png" alt="fine"> <img data-galeo-src="gone.png" alt="lost"></p>';
    const container = await render(<DocumentView {...props} rendered={{ html }} scheme="light" onResolveImage={resolve} />);
    const shadow = shadowOf(container);
    await vi.waitFor(() => expect(shadow.querySelector('img')?.getAttribute('src')).toBe('galeo://file/abc'));
    expect(resolve.mock.calls.map(([src]) => src)).toEqual(['ok.png', 'gone.png']);
    const refused = shadow.querySelector('.galeo-image-refused');
    expect(refused?.textContent).toBe('Image not shown: gone.png');
    expect(shadow.querySelectorAll('img')).toHaveLength(1);
  });
});

describe('DocumentView editing', () => {
  it("makes the source editable on request and focuses it, reports the reader's edits and hands out the text", async () => {
    // happy-dom can't follow CodeMirror's focus inside a shadow root: the call is ours, focusing for real is the e2e's.
    const { EditorView } = await import('@codemirror/view');
    const focus = vi.spyOn(EditorView.prototype, 'focus').mockImplementation(() => {});
    const onEdit = vi.fn();
    const handle = { current: null as import('./DocumentView').DocumentHandle | null };
    const container = await render(<DocumentView {...props} view="source" rendered={null} scheme="light" editable onEdit={onEdit} ref={handle} />);
    const shadow = shadowOf(container);
    await vi.waitFor(() => expect(shadow.querySelector('.cm-content')).not.toBeNull(), { timeout: 5_000 });
    const content = shadow.querySelector('.cm-content')!;
    await vi.waitFor(() => expect(content.getAttribute('aria-readonly')).toBeNull());
    expect(focus).toHaveBeenCalled();

    const view = EditorView.findFromDOM(shadow.querySelector<HTMLElement>('.cm-editor')!)!;
    act(() => view.dispatch({ changes: { from: view.state.doc.length, insert: '!' }, userEvent: 'input.type' }));

    expect(onEdit).toHaveBeenCalledOnce();
    expect(handle.current?.sourceText()).toBe('# src!');

    await act(async () => root!.render(<DocumentView {...props} view="source" rendered={null} scheme="light" editable={false} onEdit={onEdit} ref={handle} />));
    expect(content.getAttribute('aria-readonly')).toBe('true');
    focus.mockRestore();
  });
});
