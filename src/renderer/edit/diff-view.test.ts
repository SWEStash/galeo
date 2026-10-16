import { afterEach, describe, expect, it } from 'vitest';
import { createDiffView } from './diff-view';

/** Whether any text in `element` is highlighted (a class of the highlight style's, not CodeMirror's own `cm-` ones). */
const highlighted = (element: Element) => [...element.querySelectorAll('.cm-line span')].some((span) => [...span.classList].some((name) => !name.startsWith('cm-')));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('createDiffView', () => {
  it('highlights both sides with the language once its grammar has loaded, without fold markers', async () => {
    const parent = document.body.appendChild(document.createElement('div'));
    const diff = createDiffView({ parent, mine: '{"a": 1}\n', theirs: '{"a": 2}\n', language: 'JSON' });
    await diff.grammar;
    const sides = parent.querySelectorAll('.cm-editor');
    expect(sides).toHaveLength(2);
    for (const side of sides) expect(highlighted(side)).toBe(true);
    expect(parent.querySelector('.cm-foldGutter')).toBeNull();
    diff.destroy();
  });
});
