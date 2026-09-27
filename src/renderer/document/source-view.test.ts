import { afterEach, describe, expect, it } from 'vitest';
import { createSourceView } from './source-view';

function shadowContainer() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  const parent = document.createElement('div');
  root.append(parent);
  return { root, parent };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('createSourceView', () => {
  it('shows the text read-only, with line numbers', () => {
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: '# a\nb\n', language: 'markdown', wrap: false });
    expect(source.view.state.doc.toString()).toBe('# a\nb\n');
    expect(source.view.state.readOnly).toBe(true);
    expect(parent.querySelector('.cm-lineNumbers')).not.toBeNull();
    source.destroy();
  });

  it('toggles line wrapping', () => {
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: 'x', language: null, wrap: false });
    expect(parent.querySelector('.cm-lineWrapping')).toBeNull();
    source.setWrap(true);
    expect(parent.querySelector('.cm-lineWrapping')).not.toBeNull();
    source.setWrap(false);
    expect(parent.querySelector('.cm-lineWrapping')).toBeNull();
    source.destroy();
  });

  it('replaces its text in place', () => {
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: 'one', language: null, wrap: false });
    const view = source.view;
    source.setText('two\nlines');
    expect(source.view).toBe(view);
    expect(view.state.doc.lines).toBe(2);
    source.destroy();
  });

  it('highlights Markdown syntax', () => {
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: '# Heading\n', language: 'markdown', wrap: false });
    const line = parent.querySelector('.cm-line');
    expect(line?.querySelector('span[class]')).not.toBeNull();
    source.destroy();
  });

  it('marks log lines with their level, as a text badge and a line class', () => {
    const { root, parent } = shadowContainer();
    const text = 'INFO started\nplain line\nWARN slow\nERROR boom\nDEBUG detail\n';
    const source = createSourceView({ root, parent, text, language: 'log', wrap: false });
    // The gutter's width spacer is a hidden element too.
    const badges = [...parent.querySelectorAll<HTMLElement>('.galeo-log-gutter .cm-gutterElement')]
      .filter((element) => element.style.visibility !== 'hidden')
      .map((element) => element.textContent);
    expect(badges.filter(Boolean)).toEqual(['INF', 'WRN', 'ERR', 'DBG']);
    const classes = [...parent.querySelectorAll('.cm-line')].map((line) =>
      [...line.classList].find((name) => name.startsWith('galeo-log-')) ?? null,
    );
    expect(classes).toEqual(['galeo-log-info', null, 'galeo-log-warn', 'galeo-log-error', 'galeo-log-debug', null]);
    source.destroy();
  });

  it('finds matches, steps through them with wrap-around and reports n of m', () => {
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: 'Plan\nthe plan\nno\nPLAN\n', language: null, wrap: false });
    expect(source.find('plan', { caseSensitive: false })).toEqual({ current: 1, total: 3, capped: false });
    expect(source.view.state.sliceDoc(source.view.state.selection.main.from, source.view.state.selection.main.to)).toBe('Plan');
    expect(source.findStep(1)).toEqual({ current: 2, total: 3, capped: false });
    expect(source.findStep(1)).toEqual({ current: 3, total: 3, capped: false });
    expect(source.findStep(1)).toEqual({ current: 1, total: 3, capped: false });
    expect(source.findStep(-1)).toEqual({ current: 3, total: 3, capped: false });
    expect(parent.querySelectorAll('.cm-searchMatch').length).toBeGreaterThan(0);
    source.destroy();
  });

  it('matches case when asked, treats the query as text, and reports no matches', () => {
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: 'Plan plan a.b', language: null, wrap: false });
    expect(source.find('plan', { caseSensitive: true })).toEqual({ current: 1, total: 1, capped: false });
    expect(source.find('a.b', { caseSensitive: false }).total).toBe(1);
    expect(source.find('zzz', { caseSensitive: false })).toEqual({ current: 0, total: 0, capped: false });
    source.destroy();
  });

  it('stops counting at the cap', () => {
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: 'x'.repeat(50), language: null, wrap: false, findCap: 10 });
    expect(source.find('x', { caseSensitive: false })).toMatchObject({ total: 10, capped: true });
    source.destroy();
  });

  it('clears its highlights', () => {
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: 'a a a', language: null, wrap: false });
    source.find('a', { caseSensitive: false });
    source.clearFind();
    expect(parent.querySelectorAll('.cm-searchMatch')).toHaveLength(0);
    source.destroy();
  });
});
