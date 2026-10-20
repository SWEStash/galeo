import { describe, expect, it, vi } from 'vitest';
import { DARK_PIE, fragmentUrlsOnly, onlyFragments, renderMermaid } from './mermaid-engine';

const engine = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn(async () => ({ svg: '<svg></svg>' })) }));
vi.mock('mermaid', () => ({ default: engine }));

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

describe('renderMermaid', () => {
  it("draws the dark theme with our pie colours, and the light theme as Mermaid's default", async () => {
    await renderMermaid('pie\n"a": 1', 'dark');
    expect(engine.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark', themeVariables: DARK_PIE }));
    await renderMermaid('pie\n"a": 1', 'light');
    expect(engine.initialize).toHaveBeenLastCalledWith(expect.not.objectContaining({ themeVariables: expect.anything() }));
    expect(engine.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'default' }));
  });
});

describe("fragmentUrlsOnly: the diagram's own style sheet", () => {
  it('keeps its rules and its references to the diagram itself', () => {
    const css = '#d .node rect{fill:#ececff;stroke:#9370db;} #d .edge{marker-end:url(#arrow);fill:url( "#grad" );}';
    expect(fragmentUrlsOnly(css)).toBe(css);
  });

  it('drops URLs that point anywhere else, however they are written', () => {
    expect(fragmentUrlsOnly('#d .node{fill:url(theme.png);stroke:red;}')).toBe('#d .node{fill:none;stroke:red;}');
    expect(fragmentUrlsOnly("#d .a{background:URL( 'x.png' ) red;}")).toBe('#d .a{background:none red;}');
    expect(fragmentUrlsOnly('#d .a{fill:url(#ok);mask:url("galeo://app/a.svg");}')).toBe('#d .a{fill:url(#ok);mask:none;}');
  });
});
