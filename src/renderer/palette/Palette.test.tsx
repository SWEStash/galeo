import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Palette } from './Palette';
import { fillInput } from '../testing/dom';

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

async function render(onChoose = vi.fn(), platform: 'linux' | 'darwin' = 'linux') {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<Palette platform={platform} onChoose={onChoose} onClose={() => {}} />));
  return onChoose;
}

async function type(text: string) {
  const input = document.querySelector('input')!;
  await fillInput(input, text);
}

// Our commands only: the list's empty state is wrapped in an option of its own.
const options = () => [...document.querySelectorAll('[role="option"].palette-item')];

describe('Palette', () => {
  it('lists the commands with their keys, the field focused as a combobox', async () => {
    await render();
    expect(document.activeElement?.getAttribute('role')).toBe('combobox');
    const toggle = options().find((option) => option.textContent?.includes('Toggle source view'));
    expect(toggle?.querySelector('kbd')?.textContent).toBe('Ctrl+U');
  });

  it('keeps the commands whose name contains what is typed, ignoring case', async () => {
    await render();
    await type('ZOOM');
    expect(options().map((option) => option.querySelector('.palette-label')?.textContent)).toEqual(['Zoom in', 'Zoom out', 'Reset zoom']);
  });

  it('says so when nothing matches', async () => {
    await render();
    await type('no such command');
    expect(options()).toEqual([]);
    expect(document.querySelector('[data-testid="palette-empty"]')?.textContent).toMatch(/No commands/);
  });

  it('runs the first match on Enter when none is highlighted', async () => {
    const onChoose = await render();
    await type('wrap');
    await act(async () => document.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ label: 'Toggle wrap', action: { kind: 'command', command: 'toggleWrap' } }));
  });
});
