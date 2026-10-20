import { describe, expect, it, vi } from 'vitest';
import { DARK_PIE, fragmentUrlsOnly, onlyFragments, renderMermaid } from './mermaid-engine';

const engine = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn(async () => ({ svg: '<svg></svg>' })), mermaidAPI: { reset: vi.fn() } }));
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
    expect(kept('style', 'background: image-set("x.png" 1x)')).toBe(false);
    expect(kept('fill', 'u\\72l(x.png)')).toBe(false);
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

  it("starts each diagram from galeo's settings, without the directives of one drawn before", async () => {
    const calls: string[] = [];
    engine.mermaidAPI.reset.mockImplementation(() => void calls.push('reset'));
    engine.initialize.mockImplementation(() => void calls.push('initialize'));
    await renderMermaid('pie\n"a": 1', 'light');
    expect(calls).toEqual(['reset', 'initialize']);
  });

  it("keeps a document's %%{init}%% from setting the diagram's fonts, which reach its style sheet", async () => {
    await renderMermaid('pie\n"a": 1', 'light');
    const { secure } = engine.initialize.mock.lastCall![0] as { secure: string[] };
    expect(secure).toEqual(expect.arrayContaining(['themeCSS', 'fontFamily', 'altFontFamily']));
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

  it('drops the other ways CSS names an image: image sets, src(), and escaped names', () => {
    expect(fragmentUrlsOnly('#d .a{background:image-set("x.png" 1x);fill:red}')).toBe('#d .a{background:none;fill:red}');
    expect(fragmentUrlsOnly('#d .a{background:-webkit-image-set(url(x.png) 1x, url(#ok) 2x)}')).toBe('#d .a{background:none}');
    expect(fragmentUrlsOnly('#d .a{background:src("x.png")}')).toBe('#d .a{background:none}');
    expect(fragmentUrlsOnly('#d .a{background:u\\72l(x.png)}')).toBe('#d .a{background:none}');
    expect(fragmentUrlsOnly('#d .a{background:\\75 rl(x.png)}')).toBe('#d .a{background:none}');
    expect(fragmentUrlsOnly('#d .a{background:\\55\\52\\4c(x.png)}')).toBe('#d .a{background:none}');
    expect(fragmentUrlsOnly('#d .a{font-family:"trebuchet ms",verdana;fill:url(#ok)}')).toBe('#d .a{font-family:"trebuchet ms",verdana;fill:url(#ok)}');
  });
});
