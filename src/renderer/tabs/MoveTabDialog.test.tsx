import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OtherWindow } from '../../shared/contracts';
import { MoveTabDialog } from './MoveTabDialog';

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

async function render(windows: OtherWindow[]) {
  vi.stubGlobal('galeo', { tabs: { windows: vi.fn().mockResolvedValue(windows) } });
  const onChoose = vi.fn();
  const onClose = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<MoveTabDialog onChoose={onChoose} onClose={onClose} />));
  return { onChoose, onClose };
}

const dialog = () => document.querySelector<HTMLElement>('[data-testid="move-tab"]')!;
const options = () => [...dialog().querySelectorAll<HTMLElement>('[role="option"]')];

describe('MoveTabDialog (UX F15)', () => {
  it('lists the other windows by profile and the file each shows, and moves the tab to the one chosen', async () => {
    const { onChoose } = await render([
      { window: 7, profile: 'Work', accent: '#d64545', shows: 'notes.md' },
      { window: 9, profile: 'default', accent: null, shows: null },
    ]);
    expect(dialog().querySelector('h2')?.textContent).toBe('Move tab to window');
    await vi.waitFor(() => expect(options()).toHaveLength(2));
    expect(options().map((option) => option.textContent)).toEqual(['Work notes.md', 'default No tabs']);
    expect(options()[0]!.querySelector('.profile-chip-swatch')?.getAttribute('aria-hidden')).toBe('true');
    await act(async () => options()[1]!.click());
    expect(onChoose).toHaveBeenCalledWith(9);
  });

  it('says when no other window is open, and closes', async () => {
    const { onClose } = await render([]);
    await vi.waitFor(() => expect(dialog().textContent).toContain('No other windows are open.'));
    expect(options()).toHaveLength(0);
    const cancel = [...dialog().querySelectorAll('button')].find((button) => button.textContent === 'Cancel')!;
    await act(async () => cancel.click());
    expect(onClose).toHaveBeenCalled();
  });
});
