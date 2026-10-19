import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZoomViewer } from './ZoomViewer';

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe('ZoomViewer', () => {
  it('closes on Esc pressed before it has taken focus', () => {
    // The Expand button that opened it keeps focus until the dialog takes it, a moment later.
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const host = document.createElement('div');
    document.body.append(host);
    const onClose = vi.fn();
    act(() => {
      root = createRoot(host);
      root.render(<ZoomViewer content={{ kind: 'image', url: 'galeo://image/1' }} name="A chart" onClose={onClose} />);
    });
    opener.focus();

    act(() => {
      opener.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes once on Esc from inside it', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onClose = vi.fn();
    act(() => {
      root = createRoot(host);
      root.render(<ZoomViewer content={{ kind: 'image', url: 'galeo://image/1' }} name="A chart" onClose={onClose} />);
    });
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    dialog.focus();

    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('names each toolbar button with the text it shows, so a voice command naming it finds it', () => {
    const host = document.createElement('div');
    document.body.append(host);
    act(() => {
      root = createRoot(host);
      root.render(<ZoomViewer content={{ kind: 'image', url: 'galeo://image/1' }} name="A chart" onClose={vi.fn()} />);
    });
    const worded = [...document.querySelectorAll('button')].filter((button) => /\w/.test(button.textContent ?? ''));
    expect(worded.map((button) => button.textContent)).toEqual(['Fit', '100 %']);
    for (const button of worded) expect(button.getAttribute('aria-label')).toContain(button.textContent);
  });
});
