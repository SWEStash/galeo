import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OutlineEntry } from '../worker/pipeline/render';
import { OutlinePanel } from './OutlinePanel';

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

const entry = (depth: number, text: string): OutlineEntry => ({ depth, text, id: `h-${text}`, line: 1 });
const ENTRIES = [entry(1, 'Title'), entry(2, 'Install'), entry(3, 'Linux'), entry(2, 'Use'), entry(4, 'Deep'), entry(1, 'Appendix')];

async function render(props: Partial<Parameters<typeof OutlinePanel>[0]> = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const handlers = { onChoose: vi.fn(), onClose: vi.fn() };
  await act(async () => root!.render(<OutlinePanel entries={ENTRIES} current="h-Install" {...handlers} {...props} />));
  return { container, ...handlers };
}

const buttons = (container: HTMLElement) => [...container.querySelectorAll('button')];

describe('OutlinePanel', () => {
  it('lists the headings as nested lists in a navigation landmark', async () => {
    const { container } = await render();
    const nav = container.querySelector('nav');
    expect(nav?.getAttribute('aria-label')).toBe('Outline');
    expect(buttons(container).map((button) => button.textContent)).toEqual(['Title', 'Install', 'Linux', 'Use', 'Deep', 'Appendix']);
    // Each heading sits in the list of the nearest shallower one; a skipped level nests one step.
    const parentOf = (text: string) => buttons(container).find((button) => button.textContent === text)!.closest('ul')!.closest('li')?.querySelector('button')?.textContent;
    expect(parentOf('Install')).toBe('Title');
    expect(parentOf('Linux')).toBe('Install');
    expect(parentOf('Deep')).toBe('Use');
    expect(parentOf('Appendix')).toBeUndefined();
  });

  it('marks the heading being read', async () => {
    const { container } = await render();
    expect(buttons(container).filter((button) => button.getAttribute('aria-current') === 'location').map((button) => button.textContent)).toEqual(['Install']);
  });

  it('goes to a heading when chosen', async () => {
    const { container, onChoose } = await render();
    await act(async () => buttons(container)[2]!.click());
    expect(onChoose).toHaveBeenCalledWith('h-Linux');
  });

  it('closes on Esc', async () => {
    const { container, onClose } = await render();
    await act(async () => buttons(container)[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('says so when the document has no headings', async () => {
    const { container } = await render({ entries: [], current: null });
    expect(container.querySelector('nav')?.textContent).toContain('No headings');
  });

  it('takes the focus, on the heading being read, only when asked', async () => {
    const { container } = await render();
    expect(container.contains(document.activeElement)).toBe(false);
    await act(async () => root!.render(<OutlinePanel entries={ENTRIES} current="h-Install" onChoose={() => {}} onClose={() => {}} autoFocus />));
    expect(document.activeElement?.textContent).toBe('Install');
  });
});
