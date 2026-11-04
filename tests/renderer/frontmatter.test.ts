import { describe, expect, it } from 'vitest';
import { flatFields } from '../../src/renderer/worker/pipeline/frontmatter';
import { createRenderer } from '../../src/renderer/worker/pipeline/render';

function dom(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

describe('flatFields', () => {
  it('reads simple key: value lines, in order', () => {
    expect(flatFields('title: Agent plan\nstatus: Accepted\ndate: 2026-11-04', 'yaml')).toEqual([
      ['title', 'Agent plan'],
      ['status', 'Accepted'],
      ['date', '2026-11-04'],
    ]);
  });

  it('removes one pair of matching outer quotes, and keeps flow lists as written', () => {
    expect(flatFields(`a: "quoted: yes"\nb: 'single'\nc: "half'\ntags: [x, y]`, 'yaml')).toEqual([
      ['a', 'quoted: yes'],
      ['b', 'single'],
      ['c', `"half'`],
      ['tags', '[x, y]'],
    ]);
  });

  it('skips blank lines and comment lines, and accepts keys with dots, dashes and digits', () => {
    expect(flatFields('# a comment\n\npub-date: 1\nog.title: x\nv2: y', 'yaml')).toEqual([
      ['pub-date', '1'],
      ['og.title', 'x'],
      ['v2', 'y'],
    ]);
  });

  it.each([
    ['a nested map', 'author:\n  name: Ada'],
    ['a list', 'tags:\n- a\n- b'],
    ['an indented line', 'title: x\n  more'],
    ['a block scalar', 'summary: |\n  text'],
    ['a folded scalar', 'summary: >'],
    ['an anchor', 'base: &b x'],
    ['an alias', 'copy: *b'],
    ['a tag', 'when: !!str 2026'],
    ['a duplicate key', 'a: 1\na: 2'],
    ['a line that is no field', 'just text'],
    ['nothing at all', '# only a comment'],
  ])('gives up on %s, so the raw block shows', (_name, value) => {
    expect(flatFields(value, 'yaml')).toBeNull();
  });

  it('leaves TOML to the raw block', () => {
    expect(flatFields('title = "x"', 'toml')).toBeNull();
  });
});

describe('front matter in the rendered document', () => {
  const render = createRenderer();

  it('shows flat front matter as an open list of fields, as text, positioned on its lines', async () => {
    const doc = dom((await render.markdown('---\ntitle: "<b>Plan</b>"\nstatus: Draft\n---\n\n# Body\n')).html);
    const block = doc.querySelector('details.galeo-frontmatter')!;
    expect(block.hasAttribute('open')).toBe(true);
    expect(block.querySelector('summary')?.textContent).toBe('Front matter');
    expect([...block.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual(['title', 'status']);
    expect([...block.querySelectorAll('dd')].map((dd) => dd.textContent)).toEqual(['<b>Plan</b>', 'Draft']);
    expect(block.querySelector('b')).toBeNull();
    expect(block.querySelector('pre')).toBeNull();
    expect(block.getAttribute('data-src-line')).toBe('1');
    expect(block.getAttribute('data-src-end')).toBe('4');
  });

  it('shows other front matter as the collapsed, highlighted source block', async () => {
    const doc = dom((await render.markdown('---\nauthor:\n  name: Ada\n---\n\nText.\n')).html);
    const block = doc.querySelector('details.galeo-frontmatter')!;
    expect(block.hasAttribute('open')).toBe(false);
    expect(block.querySelector('summary')?.textContent).toBe('Front matter');
    expect(block.querySelector('pre.shiki')?.textContent).toContain('name: Ada');
    expect(block.querySelector('dl')).toBeNull();
  });

  it("doesn't count the fields as prose", async () => {
    const { words } = await render.markdown('---\ntitle: four words right here\n---\n\nTwo words.\n');
    expect(words).toBe(2);
  });
});
