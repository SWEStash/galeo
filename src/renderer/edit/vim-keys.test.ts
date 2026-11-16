import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { getCM, Vim } from '@replit/codemirror-vim';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { vimKeys, type VimHooks } from './vim-keys';

function editor(text: string, hooks: Partial<VimHooks> = {}) {
  const all: VimHooks = { save: vi.fn(), paste: vi.fn(), onMode: vi.fn(), ...hooks };
  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({ parent, state: EditorState.create({ doc: text, extensions: [vimKeys(all)] }) });
  const cm = getCM(view)!;
  const keys = (sequence: string) => {
    for (const key of sequence) Vim.handleKey(cm, key, 'user');
  };
  return { view, cm, keys, hooks: all };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('vimKeys', () => {
  it('starts in normal mode, marks the editor with its mode, and reports it and each change', () => {
    const { view, keys, hooks } = editor('one\n');
    expect(view.dom.dataset['vimMode']).toBe('normal');

    keys('i');
    expect(view.dom.dataset['vimMode']).toBe('insert');
    Vim.handleKey(getCM(view)!, '<Esc>', 'user');
    keys('v');
    expect(view.dom.dataset['vimMode']).toBe('visual');

    expect(vi.mocked(hooks.onMode).mock.calls.map(([mode]) => mode)).toEqual(['normal', 'insert', 'normal', 'visual']);
  });

  it(':w saves the editor it was typed in', () => {
    const first = editor('a\n');
    const second = editor('b\n');

    Vim.handleEx(second.cm as Parameters<typeof Vim.handleEx>[0], 'w');

    expect(second.hooks.save).toHaveBeenCalledOnce();
    expect(first.hooks.save).not.toHaveBeenCalled();
  });

  it('pastes the + register through galeo, and other registers as Vim does', () => {
    const { view, keys, hooks } = editor('one\ntwo\n');

    keys('"+p');
    keys('"+P');
    expect(vi.mocked(hooks.paste).mock.calls).toEqual([[view, { after: true }], [view, { after: false }]]);

    // A motion like `j` measures the layout, which the test DOM has none of: yank and put in place.
    keys('"ayy"ap');
    expect(view.state.doc.toString()).toBe('one\none\ntwo\n');
  });
});
