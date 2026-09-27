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
});
