import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Icon, ICON_NAMES, iconElement } from './icons';

let root: Root | undefined;

async function rendered(name: (typeof ICON_NAMES)[number]): Promise<SVGSVGElement> {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<Icon name={name} />));
  return container.querySelector('svg')!;
}

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

/** The shapes of an icon, as tag + sorted attributes, so the two builders can be compared. */
const shapes = (svg: SVGSVGElement) =>
  [...svg.children].map((shape) => `${shape.tagName.toLowerCase()} ${[...shape.attributes].map((a) => `${a.name}=${a.value}`).sort().join(' ')}`);

describe('icons', () => {
  it('covers the controls the visual refresh lists', () => {
    for (const name of ['plus', 'grid', 'search', 'more', 'panel', 'close', 'pin', 'copy', 'check', 'download', 'expand', 'follow'] as const) {
      expect(ICON_NAMES).toContain(name);
    }
  });

  it.each(ICON_NAMES)('%s is decorative and draws only shapes, the same from React and from the DOM builder', async (name) => {
    const fromReact = await rendered(name);
    const fromDom = iconElement(name);
    for (const svg of [fromReact, fromDom]) {
      expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('focusable')).toBe('false');
      expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(svg.children.length).toBeGreaterThan(0);
      for (const shape of svg.querySelectorAll('*')) {
        expect(['path', 'circle', 'rect']).toContain(shape.tagName.toLowerCase());
        expect([...shape.attributes].map((a) => a.name).filter((a) => a.startsWith('on') || a.includes('href'))).toEqual([]);
      }
    }
    expect(shapes(fromReact)).toEqual(shapes(fromDom));
  });
});
