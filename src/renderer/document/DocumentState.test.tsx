import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentContent } from '../../shared/contracts';
import { DocumentBanner, DocumentLoading, DocumentState } from './DocumentState';

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

describe('DocumentLoading', () => {
  it('offers no Cancel until it is given one', async () => {
    const container = await render(<DocumentLoading />);
    expect(container.querySelector('[role=status]')).not.toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  it('offers a quiet Cancel, named for what it cancels, beside the status', async () => {
    const onCancel = vi.fn();
    const container = await render(<DocumentLoading onCancel={onCancel} />);
    const button = container.querySelector('button')!;
    expect(button.textContent).toBe('Cancel');
    expect(button.getAttribute('aria-label')).toBe('Cancel rendering');
    expect(button.className).toBe('document-loading-cancel');
    expect(container.querySelector('[role=status] button')).toBeNull();
    button.click();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe('DocumentBanner', () => {
  it('says a render was cancelled, with the way back it is given', async () => {
    const again = vi.fn();
    const container = await render(<DocumentBanner kind="render-cancelled" actions={[{ label: 'Show as table', onAction: again }]} />);
    expect(container.textContent).toBe('Rendering cancelled — showing sourceShow as table');
    container.querySelector('button')!.click();
    expect(again).toHaveBeenCalledOnce();
  });
});

describe('DocumentState', () => {
  it.each([
    [{ state: 'empty', path: '/d/e.md', format: 'markdown' }, 'This file is empty'],
    [{ state: 'missing', path: '/d/gone.md' }, 'File not found'],
    [{ state: 'no-permission', path: '/d/secret.md' }, "galeo can't read this file (permission denied)"],
    [{ state: 'binary', path: '/d/x.png', size: 1536 }, 'This looks like a binary file'],
    [{ state: 'not-a-file', path: '/d/folder' }, "This isn't a regular file"],
    [{ state: 'too-large', path: '/d/huge.log', maxBytes: 256 * 1024 * 1024 }, 'This file is too large to open'],
    [{ state: 'unreadable', path: '/d/odd' }, "galeo can't read this file"],
  ] as [Exclude<DocumentContent, { state: 'ready' | 'loading' }>, string][])('shows the %j state with its message and path', async (content, message) => {
    const container = await render(<DocumentState content={content} />);
    const state = container.querySelector('[data-testid="document-state"]')!;
    expect(state.getAttribute('data-state')).toBe(content.state);
    expect(state.querySelector('.document-state-title')?.textContent).toBe(message);
    expect(state.textContent).toContain(content.path);
  });
});
