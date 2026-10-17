import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TableOptionsMenu } from './TableOptionsMenu';

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

const open = async (container: HTMLElement) => {
  await act(async () => container.querySelector('button')!.click());
  return [...document.querySelectorAll<HTMLElement>('[role=menuitemradio], [role=menuitemcheckbox], [role=menuitem]')];
};

describe('TableOptionsMenu', () => {
  it('reads the separator in use (Auto with what it found) and the header', async () => {
    const container = await render(<TableOptionsMenu options={{ separator: 'auto', found: ';', header: true }} onCommand={vi.fn()} />);
    expect(container.querySelector('button')!.textContent).toBe('Auto (;) · Header');
    await act(async () => root!.render(<TableOptionsMenu options={{ separator: '\t', found: '\t', header: false }} onCommand={vi.fn()} />));
    expect(container.querySelector('button')!.textContent).toBe('Tab · No header');
    expect(container.querySelector('button')!.getAttribute('aria-label')).toBe('Table options: Tab, no header');
  });

  it('offers the separators as a choice, the header as a check, and a reset, each running its command', async () => {
    const onCommand = vi.fn();
    const container = await render(<TableOptionsMenu options={{ separator: 'auto', found: ',', header: true }} onCommand={onCommand} />);
    const items = await open(container);
    expect(items.map((item) => [item.getAttribute('role'), item.textContent])).toEqual([
      ['menuitemradio', 'Detect automatically (,)'],
      ['menuitemradio', 'Comma'],
      ['menuitemradio', 'Semicolon'],
      ['menuitemradio', 'Tab'],
      ['menuitemradio', 'Pipe'],
      ['menuitemcheckbox', 'First row is a header'],
      ['menuitem', 'Reset to defaults'],
    ]);
    expect(items[0]!.getAttribute('aria-checked')).toBe('true');
    expect(items[5]!.getAttribute('aria-checked')).toBe('true');
    await act(async () => items[4]!.click());
    expect(onCommand).toHaveBeenCalledWith('tableSeparatorPipe');
  });

  it('runs the header toggle and the reset', async () => {
    const onCommand = vi.fn();
    const container = await render(<TableOptionsMenu options={{ separator: ';', found: ';', header: true }} onCommand={onCommand} />);
    await act(async () => (await open(container))[5]!.click());
    await act(async () => (await open(container))[6]!.click());
    expect(onCommand.mock.calls).toEqual([['toggleTableHeader'], ['resetTableOptions']]);
  });
});
