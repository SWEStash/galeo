import { describe, expect, it } from 'vitest';
import { onlyFragments } from './mermaid-engine';

/** Whether the hook keeps an attribute with this name and value. */
function kept(attrName: string, attrValue: string): boolean {
  const data = { attrName, attrValue, keepAttr: true };
  onlyFragments(document.createElementNS('http://www.w3.org/2000/svg', 'path'), data);
  return data.keepAttr;
}

describe('onlyFragments', () => {
  it('keeps geometry and references to the diagram itself', () => {
    expect(kept('viewBox', '0 3.36 1215.6 223.5')).toBe(true);
    expect(kept('d', 'M0,0L10,10')).toBe(true);
    expect(kept('transform', 'translate(10, 20)')).toBe(true);
    expect(kept('marker-end', 'url(#galeo-diagram-1_flowchart-v2-pointEnd)')).toBe(true);
    expect(kept('style', "fill: url( '#gradient' ); stroke: red")).toBe(true);
    expect(kept('href', '#node')).toBe(true);
    expect(kept('xlink:href', '#node')).toBe(true);
  });

  it('drops links and URLs that leave the diagram', () => {
    expect(kept('href', 'https://example.com/')).toBe(false);
    expect(kept('xlink:href', 'javascript:alert(1)')).toBe(false);
    expect(kept('href', '')).toBe(false);
    expect(kept('fill', 'url(https://example.com/x.png)')).toBe(false);
    expect(kept('style', 'fill: url(#ok); background: URL("https://example.com/y.png")')).toBe(false);
    expect(kept('filter', "url('data:image/svg+xml,x')")).toBe(false);
  });
});
