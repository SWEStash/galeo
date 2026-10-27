import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { useZoomViewer } from './useZoomViewer';

async function mount(active = true) {
  let viewer!: ReturnType<typeof useZoomViewer>;
  function Probe({ active }: { active: boolean }) {
    viewer = useZoomViewer(active);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Probe active={active} />));
  return {
    get: () => viewer,
    run: async (action: () => void) => act(async () => action()),
    setActive: async (next: boolean) => act(async () => root.render(<Probe active={next} />)),
    unmount: () => act(() => root.unmount()),
  };
}

const frames = (count: number) => act(async () => {
  for (let i = 0; i < count; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
});

describe('useZoomViewer', () => {
  it('shows an expanded diagram or image, by name', async () => {
    const { get, run, unmount } = await mount();
    await run(() => get().expandDiagram({ svg: '<svg/>', name: 'Flow', panel: true, returnFocus: () => {} }));
    expect(get().viewer).toMatchObject({ content: { kind: 'diagram', svg: '<svg/>', panel: true }, name: 'Flow' });
    await run(() => get().expandImage({ url: 'galeo-image://1', name: 'cat.png', returnFocus: () => {} }));
    expect(get().viewer).toMatchObject({ content: { kind: 'image', url: 'galeo-image://1' }, name: 'cat.png' });
    unmount();
  });

  it('closes when its tab is no longer shown', async () => {
    const { get, run, setActive, unmount } = await mount();
    await run(() => get().expandDiagram({ svg: '<svg/>', name: 'Flow', panel: false, returnFocus: () => {} }));
    await setActive(false);
    expect(get().viewer).toBeNull();
    unmount();
  });

  it('gives focus back to what expanded it once closed', async () => {
    const { get, run, unmount } = await mount();
    const back = vi.fn();
    await run(() => get().expandDiagram({ svg: '<svg/>', name: 'Flow', panel: false, returnFocus: back }));
    await run(() => get().closeViewer());
    await frames(2);
    expect(back).toHaveBeenCalled();
    unmount();
  });
});
