import { standardKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { logLevels } from './log-view';

export type SourceLanguage = 'markdown' | 'log' | null;

export interface SourceView {
  readonly view: EditorView;
  setText(text: string): void;
  setWrap(wrap: boolean): void;
  /** The line at the top of the viewport. */
  topLine(): number;
  scrollToLine(line: number): void;
  scrollToEnd(): void;
  /** Calls `listener` when the view scrolls up (the user leaving the end of a log). */
  onScrollUp(listener: () => void): () => void;
  destroy(): void;
}

// Colours come from the app's tokens, so the source view follows light/dark like everything else.
const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '650' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '650' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--galeo-color-link)' },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator, tags.quote], color: 'var(--galeo-color-muted)' },
  { tag: tags.monospace, color: 'var(--galeo-color-fg)', backgroundColor: 'var(--galeo-color-code-bg)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--galeo-color-fg)', backgroundColor: 'var(--galeo-color-bg)' },
  '.cm-scroller': { fontFamily: 'var(--galeo-font-code)', fontSize: '14px', lineHeight: '1.5' },
  '.cm-gutters': { backgroundColor: 'var(--galeo-color-bg)', color: 'var(--galeo-color-muted)', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--galeo-color-fg)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': { caretColor: 'var(--galeo-color-fg)' },
});

const LANGUAGES: Record<Exclude<SourceLanguage, null>, () => Extension> = {
  markdown: () => markdown(),
  log: () => logLevels(),
};

/**
 * A read-only CodeMirror view inside a document's shadow root (ADR-003). Only the standard
 * navigation keys are bound: CodeMirror's default keymap would take Ctrl+U, the view toggle.
 */
export function createSourceView(options: {
  root: ShadowRoot;
  parent: HTMLElement;
  text: string;
  language: SourceLanguage;
  wrap: boolean;
}): SourceView {
  const wrapping = new Compartment();
  const view = new EditorView({
    root: options.root,
    parent: options.parent,
    state: EditorState.create({
      doc: options.text,
      extensions: [
        EditorState.readOnly.of(true),
        lineNumbers(),
        highlightActiveLineGutter(),
        keymap.of(standardKeymap),
        syntaxHighlighting(highlight),
        theme,
        wrapping.of(options.wrap ? EditorView.lineWrapping : []),
        options.language ? LANGUAGES[options.language]() : [],
      ],
    }),
  });

  return {
    view,
    setText(text) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    setWrap(wrap) {
      view.dispatch({ effects: wrapping.reconfigure(wrap ? EditorView.lineWrapping : []) });
    },
    topLine() {
      // `documentTop` already moves with scrolling: the viewport top is this far into the document.
      const block = view.lineBlockAtHeight(view.scrollDOM.getBoundingClientRect().top - view.documentTop);
      return view.state.doc.lineAt(block.from).number;
    },
    scrollToLine(line) {
      const target = view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines));
      view.dispatch({ effects: EditorView.scrollIntoView(target.from, { y: 'start', yMargin: 0 }) });
    },
    scrollToEnd() {
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.length, { y: 'end', yMargin: 0 }) });
    },
    onScrollUp(listener) {
      let last = view.scrollDOM.scrollTop;
      const onScroll = () => {
        const top = view.scrollDOM.scrollTop;
        if (top < last) listener();
        last = top;
      };
      view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });
      return () => view.scrollDOM.removeEventListener('scroll', onScroll);
    },
    destroy() {
      view.destroy();
    },
  };
}
