import { addCursorAbove, addCursorBelow } from '@codemirror/commands';
import { selectNextOccurrence, selectSelectionMatches } from '@codemirror/search';
import { foldCode, foldedRanges, syntaxTree, unfoldCode } from '@codemirror/language';
import { EditorSelection } from '@codemirror/state';
import { afterEach, describe, expect, it } from 'vitest';
import { takenByDesktop } from '../../shared/desktop-keys';
import { createSourceView, editingKeys, foldingKeys } from './source-view';

function shadowContainer() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  const parent = document.createElement('div');
  root.append(parent);
  return { root, parent };
}

/** Whether any text in `element` is highlighted (a class of the highlight style's, not CodeMirror's own `cm-` ones). */
const highlighted = (element: Element) => [...element.querySelectorAll('.cm-line span')].some((span) => [...span.classList].some((name) => !name.startsWith('cm-')));

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

  it('is a named, focusable text: "Log" for logs, "Source" otherwise (WCAG 4.1.2, 2.1.1)', () => {
    for (const [language, name] of [['log', 'Log'], ['markdown', 'Source'], [null, 'Source']] as const) {
      const { root, parent } = shadowContainer();
      const source = createSourceView({ root, parent, text: 'x', language, wrap: false });
      const content = parent.querySelector('.cm-content')!;
      expect(content.getAttribute('aria-label')).toBe(name);
      expect(content.getAttribute('tabindex')).toBe('0');
      source.destroy();
    }
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

  it('changes only the part of the text that differs, so lines before and after keep their place', () => {
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: 'a\nb\nc\n', language: null, wrap: false });
    const changes: [number, number, string][] = [];
    const dispatch = source.view.dispatch.bind(source.view);
    source.view.dispatch = ((...specs: Parameters<typeof dispatch>) => {
      for (const spec of specs as { changes?: { from: number; to: number; insert: string } }[]) {
        if (spec.changes) changes.push([spec.changes.from, spec.changes.to, spec.changes.insert]);
      }
      return dispatch(...specs);
    }) as typeof dispatch;
    source.setText('a\nb\nc\nd\n');
    source.setText('a\nB\nc\nd\n');
    source.setText('a\nB\nc\nd\n');
    expect(changes).toEqual([
      [6, 6, 'd\n'],
      [2, 3, 'B'],
    ]);
    expect(source.view.state.doc.toString()).toBe('a\nB\nc\nd\n');
    source.setText('x');
    expect(source.view.state.doc.toString()).toBe('x');
    source.destroy();
  });

  it('hears a scroll up only when it leaves the end, not a small correction that stays there', () => {
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: 'x\n'.repeat(100), language: null, wrap: false });
    const scroller = source.view.scrollDOM;
    let top = 0;
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => 2000 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, get: () => 500 });
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, get: () => top, set: (value: number) => (top = value) });
    const scrollTo = (value: number) => {
      top = value;
      scroller.dispatchEvent(new Event('scroll'));
    };
    scrollTo(1500);
    let heard = 0;
    const stop = source.onScrollUp(() => heard++);
    scrollTo(1498);
    expect(heard).toBe(0);
    scrollTo(1200);
    expect(heard).toBe(1);
    stop();
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

describe('createSourceView editing', () => {
  const type = (source: ReturnType<typeof createSourceView>, text: string) =>
    source.view.dispatch(source.view.state.update({ changes: { from: source.view.state.doc.length, insert: text }, userEvent: 'input.type' }));

  it('becomes editable on request, and says so to assistive tech', () => {
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: 'a', language: 'markdown', wrap: false });
    const content = parent.querySelector('.cm-content')!;
    expect(content.getAttribute('aria-readonly')).toBe('true');
    source.setEditable(true);
    expect(source.view.state.readOnly).toBe(false);
    expect(content.getAttribute('aria-readonly')).toBeNull();
    source.setEditable(false);
    expect(source.view.state.readOnly).toBe(true);
    source.destroy();
  });

  it("tells about the reader's edits, not about new text from the file", () => {
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: 'a', language: 'markdown', wrap: false });
    source.setEditable(true);
    let edits = 0;
    source.onEdit(() => edits++);
    source.setText('from disk');
    expect(edits).toBe(0);
    type(source, '!');
    expect(edits).toBe(1);
    expect(source.text()).toBe('from disk!');
    source.destroy();
  });

  it("binds no editing key the Linux desktop keeps: no Super, no Ctrl+Alt, none of GNOME's Alt keys (UX §5)", () => {
    // CodeMirror's names (`Mod-Alt-ArrowUp`) as Electron accelerators on Linux (`Ctrl+Alt+Up`).
    const names: Record<string, string> = { Mod: 'Ctrl', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' };
    const accelerator = (key: string) => key.split(/-(?!$)/).map((part) => names[part] ?? part).join('+');
    const keys = editingKeys.flatMap((binding) => {
      const key = binding.linux ?? binding.key;
      if (!key) return [];
      return binding.shift ? [key, `Shift-${key}`] : [key];
    });
    expect(keys.length).toBeGreaterThan(30);
    for (const key of keys) expect(takenByDesktop(accelerator(key)), key).toBe(false);
  });

  it('adds a cursor above or below with Shift+Alt+↑/↓, where GNOME leaves Ctrl+Alt+↑/↓ to workspaces', () => {
    const run = (key: string) => editingKeys.find((binding) => binding.key === key)?.run;
    expect(run('Shift-Alt-ArrowUp')).toBe(addCursorAbove);
    expect(run('Shift-Alt-ArrowDown')).toBe(addCursorBelow);
    expect(run('Mod-d')).toBe(selectNextOccurrence);
    expect(run('Mod-Shift-l')).toBe(selectSelectionMatches);
  });

  it('edits at every cursor while editing, and one undo takes the edit back everywhere', async () => {
    const { undo } = await import('@codemirror/commands');
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: 'cat cat cat', language: null, wrap: false });
    source.setEditable(true);
    source.view.dispatch({ selection: EditorSelection.single(0, 3) });
    selectNextOccurrence(source.view);
    selectNextOccurrence(source.view);
    expect(source.view.state.selection.ranges).toHaveLength(3);
    source.view.dispatch(source.view.state.replaceSelection('dog'));
    expect(source.text()).toBe('dog dog dog');
    undo(source.view);
    expect(source.text()).toBe('cat cat cat');
    source.destroy();
  });

  it('keeps a single selection while reading', () => {
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: 'cat cat', language: null, wrap: false });
    source.view.dispatch({ selection: EditorSelection.create([EditorSelection.range(0, 3), EditorSelection.range(4, 7)]) });
    expect(source.view.state.selection.ranges).toHaveLength(1);
    source.destroy();
  });

  it('replaces the current match and moves to the next, recounting as it goes', () => {
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: 'a cat, a cat, a cat', language: null, wrap: false });
    source.setEditable(true);
    let edits = 0;
    source.onEdit(() => edits++);
    expect(source.find('cat', { caseSensitive: false })).toEqual({ current: 1, total: 3, capped: false });
    expect(source.replace('dog')).toEqual({ current: 1, total: 2, capped: false });
    expect(source.text()).toBe('a dog, a cat, a cat');
    expect(source.replace('dog')).toEqual({ current: 1, total: 1, capped: false });
    expect(source.replace('dog')).toEqual({ current: 0, total: 0, capped: false });
    expect(source.text()).toBe('a dog, a dog, a dog');
    expect(edits).toBe(3);
    source.destroy();
  });

  it('replaces every match, past the find cap, as one undo step', async () => {
    const { undo } = await import('@codemirror/commands');
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: 'x x x x x', language: null, wrap: false, findCap: 2 });
    source.setEditable(true);
    expect(source.find('x', { caseSensitive: false })).toEqual({ current: 1, total: 2, capped: true });
    expect(source.replaceAll('y')).toBe(5);
    expect(source.text()).toBe('y y y y y');
    undo(source.view);
    expect(source.text()).toBe('x x x x x');
    source.destroy();
  });

  it('replaces with the text as typed, and only the matches of the case asked for', () => {
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: 'Cat cat', language: null, wrap: false });
    source.setEditable(true);
    source.find('cat', { caseSensitive: true });
    expect(source.replaceAll('$&\\n')).toBe(1);
    expect(source.text()).toBe('Cat $&\\n');
    source.destroy();
  });

  it('replaces nothing while reading', () => {
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: 'cat cat', language: null, wrap: false });
    source.find('cat', { caseSensitive: false });
    expect(source.replace('dog')).toEqual({ current: 1, total: 2, capped: false });
    expect(source.replaceAll('dog')).toBe(0);
    expect(source.text()).toBe('cat cat');
    source.destroy();
  });

  it('undoes edits, but not new text from the file', async () => {
    const { undo } = await import('@codemirror/commands');
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: 'a', language: 'markdown', wrap: false });
    source.setEditable(true);
    source.setText('b');
    type(source, '!');
    undo(source.view);
    expect(source.text()).toBe('b');
    expect(undo(source.view)).toBe(false);
    source.destroy();
  });

  it('shows the text at once, then highlights it and adds fold markers once the grammar has loaded', async () => {
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: 'name: galeo\nitems:\n  - a\n  - b\n', language: 'YAML', wrap: false });
    expect(source.text()).toContain('name: galeo');
    expect(highlighted(parent)).toBe(false);
    expect(parent.querySelector('.cm-foldGutter')).toBeNull();
    await source.grammar;
    expect(syntaxTree(source.view.state).length).toBeGreaterThan(0);
    expect(highlighted(parent)).toBe(true);
    expect(parent.querySelector('.cm-foldGutter')).not.toBeNull();
    source.destroy();
  });

  it('folds and unfolds a block, read-only or editing', async () => {
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: 'items:\n  - a\n  - b\nnext: 1\n', language: 'YAML', wrap: false });
    await source.grammar;
    expect(foldCode(source.view)).toBe(true);
    expect(foldedRanges(source.view.state).size).toBe(1);
    expect(unfoldCode(source.view)).toBe(true);
    expect(foldedRanges(source.view.state).size).toBe(0);
    source.destroy();
  });

  it('keeps Markdown, logs, plain text and an unknown language without fold markers', async () => {
    for (const language of ['markdown', 'log', null, 'No such language']) {
      const { root, parent } = shadowContainer();
      const source = createSourceView({ root, parent, text: '# a\nb\n', language, wrap: false });
      await source.grammar;
      expect(parent.querySelector('.cm-foldGutter'), String(language)).toBeNull();
      source.destroy();
    }
  });

  it('leaves a view closed before its grammar arrives alone', async () => {
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: '{"a": 1}', language: 'JSON', wrap: false });
    source.destroy();
    await expect(source.grammar).resolves.toBeUndefined();
  });

  it('folds with Ctrl+Shift+[ and unfolds with Ctrl+Shift+], and takes no key the desktop keeps', () => {
    const run = (key: string) => foldingKeys.find((binding) => binding.key === key)?.run;
    expect(run('Ctrl-Shift-[')).toBe(foldCode);
    expect(run('Ctrl-Shift-]')).toBe(unfoldCode);
    for (const binding of foldingKeys) expect(takenByDesktop(binding.key!.replaceAll('-', '+')), binding.key).toBe(false);
  });

  it('reports the outline once the grammar has loaded, and again after an edit', async () => {
    const { root, parent } = shadowContainer();
    const source = createSourceView({ root, parent, text: 'a: 1\n', language: 'YAML', wrap: false });
    const outlines: string[][] = [];
    const next = () =>
      new Promise<void>((resolve) => {
        const stop = source.onOutline((entries) => {
          outlines.push(entries.map((entry) => entry.text));
          stop();
          resolve();
        });
      });
    await next();
    const edited = next();
    source.setEditable(true);
    source.view.dispatch({ changes: { from: source.text().length, insert: 'b: 2\n' } });
    await edited;
    expect(outlines).toEqual([['a'], ['a', 'b']]);
    source.destroy();
  });
});
