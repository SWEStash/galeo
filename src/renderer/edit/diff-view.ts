import { MergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { addGrammar, sourceLook, type SourceLanguage } from '../document/source-view';

/**
 * The reader's unsaved text beside the file on disk (UX F12), both read-only, changes marked and
 * long unchanged stretches folded. Loaded with the first diff, like the editor.
 */
export function createDiffView(options: { parent: HTMLElement; mine: string; theirs: string; language: SourceLanguage }): { grammar: Promise<void>; destroy(): void } {
  const side = (doc: string, label: string) => ({
    doc,
    extensions: [
      EditorState.readOnly.of(true),
      // Each side is a named stop on Tab, so the keyboard can reach and scroll it.
      EditorView.contentAttributes.of({ 'aria-label': label, tabindex: '0' }),
      lineNumbers(),
      sourceLook(options.language),
    ],
  });
  const merge = new MergeView({
    parent: options.parent,
    a: side(options.mine, 'Mine (unsaved)'),
    b: side(options.theirs, 'Theirs (on disk)'),
    collapseUnchanged: { margin: 3, minSize: 4 },
  });
  let open = true;
  return {
    grammar: addGrammar([merge.a, merge.b], options.language, () => open),
    destroy() {
      open = false;
      merge.destroy();
    },
  };
}
