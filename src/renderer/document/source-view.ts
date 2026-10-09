import { defaultKeymap, history, historyKeymap, standardKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  openSearchPanel,
  search,
  SearchQuery,
  searchPanelOpen,
  setSearchQuery,
} from '@codemirror/search';
import { Annotation, Compartment, EditorSelection, EditorState, Transaction, type Extension } from '@codemirror/state';
import { EditorView, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { logLevels } from './log-view';

export type SourceLanguage = 'markdown' | 'log' | null;

/** Where find is: the 1-based current match (0 without one) of `total`, which stops at a cap. */
export interface FindResult {
  current: number;
  total: number;
  capped: boolean;
}

/** How close to the end still counts as at the end. */
const END_SLACK_PX = 4;

/** Counting stops here, so a common word in a 100 MB log doesn't stall the find bar. */
const FIND_CAP = 10_000;

export interface SourceView {
  readonly view: EditorView;
  setText(text: string): void;
  setWrap(wrap: boolean): void;
  /** The line at the top of the viewport. */
  topLine(): number;
  scrollToLine(line: number): void;
  scrollToEnd(): void;
  /** Highlights `query` and selects the first match from the reading position on. */
  find(query: string, options: { caseSensitive: boolean }): FindResult;
  findStep(direction: 1 | -1): FindResult;
  clearFind(): void;
  /** Edit mode (ADR-013): the reader's typing changes the text; otherwise it's read-only. */
  setEditable(editable: boolean): void;
  /** The text as shown now, with the reader's edits. */
  text(): string;
  /** Calls `listener` after each edit of the reader's (never for new text from the file). */
  onEdit(listener: () => void): () => void;
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
  '.cm-searchMatch': { backgroundColor: 'var(--galeo-color-mark)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--galeo-color-mark-current)', color: '#1f2328' },
});

/** Marks the file's own text arriving (`setText`), which isn't an edit and can't be undone. */
const fromFile = Annotation.define<boolean>();

/**
 * Read-only, or editing: undo history and the editing keys, before the reading keys. The window's
 * own keys still come first: the app takes them in the capture phase and CodeMirror skips a key
 * already handled, so only keys the app declines (typing, Alt+arrows) reach the editor.
 */
const reading = (): Extension => EditorState.readOnly.of(true);
const editing = (): Extension => [history(), keymap.of([...defaultKeymap, ...historyKeymap])];

const LANGUAGES: Record<Exclude<SourceLanguage, null>, () => Extension> = {
  markdown: () => markdown(),
  log: () => logLevels(),
};

/** How source text looks, in the source view and in the diff of unsaved edits. */
export const sourceLook = (language: SourceLanguage): Extension => [
  syntaxHighlighting(highlight),
  theme,
  language ? LANGUAGES[language]() : [],
];

/**
 * A CodeMirror view inside a document's shadow root (ADR-003), read-only unless the tab is in edit
 * mode. Reading binds only the standard navigation keys.
 */
export function createSourceView(options: {
  root: ShadowRoot;
  parent: HTMLElement;
  text: string;
  language: SourceLanguage;
  wrap: boolean;
  findCap?: number;
}): SourceView {
  const wrapping = new Compartment();
  const mode = new Compartment();
  const editListeners = new Set<() => void>();
  const findCap = options.findCap ?? FIND_CAP;
  let total = { count: 0, capped: false };
  const view = new EditorView({
    root: options.root,
    parent: options.parent,
    state: EditorState.create({
      doc: options.text,
      extensions: [
        mode.of(reading()),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && update.transactions.some((transaction) => transaction.docChanged && !transaction.annotation(fromFile))) {
            for (const listener of editListeners) listener();
          }
        }),
        // A named text; a stop of its own on Tab, so the keyboard can reach and scroll it.
        EditorView.contentAttributes.of({ 'aria-label': options.language === 'log' ? 'Log' : 'Source', tabindex: '0' }),
        lineNumbers(),
        highlightActiveLineGutter(),
        keymap.of(standardKeymap),
        sourceLook(options.language),
        wrapping.of(options.wrap ? EditorView.lineWrapping : []),
        // The find bar is the app's own; CodeMirror only highlights and selects the matches.
        search({ createPanel: () => ({ dom: Object.assign(document.createElement('div'), { hidden: true }) }) }),
      ],
    }),
  });

  const topLine = () => {
    // `documentTop` already moves with scrolling: the viewport top is this far into the document.
    const block = view.lineBlockAtHeight(view.scrollDOM.getBoundingClientRect().top - view.documentTop);
    return view.state.doc.lineAt(block.from).number;
  };

  const query = () => new SearchQuery({ search: '', literal: true });
  let active = query();

  /** How many matches start before `position`, up to the cap. */
  const matchesBefore = (position: number) => {
    let count = 0;
    const cursor = active.getCursor(view.state, 0, position);
    while (!cursor.next().done && count < findCap) count++;
    return count;
  };

  const where = (): FindResult => {
    const selection = view.state.selection.main;
    const onMatch = total.count > 0 && active.getCursor(view.state, selection.from, selection.to).next().value?.from === selection.from;
    return { current: onMatch ? Math.min(matchesBefore(selection.from) + 1, total.count) : 0, total: total.count, capped: total.capped };
  };

  const reveal = (from: number, to: number) =>
    view.dispatch({
      selection: EditorSelection.single(from, to),
      // The current match goes to the middle of the view (UX F9).
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    });

  return {
    view,
    find(text, { caseSensitive }) {
      active = new SearchQuery({ search: text, caseSensitive, literal: true });
      if (!searchPanelOpen(view.state)) openSearchPanel(view);
      view.dispatch({ effects: setSearchQuery.of(active) });
      if (!text) {
        total = { count: 0, capped: false };
        return where();
      }
      let count = 0;
      const counter = active.getCursor(view.state);
      while (count < findCap && !counter.next().done) count++;
      total = { count, capped: count >= findCap && !counter.next().done };
      const start = view.state.doc.line(topLine()).from;
      const first = active.getCursor(view.state, start).next();
      const match = first.done ? active.getCursor(view.state).next() : first;
      if (!match.done) reveal(match.value.from, match.value.to);
      return where();
    },
    findStep(direction) {
      if (total.count === 0) return where();
      (direction === 1 ? findNext : findPrevious)(view);
      const { from } = view.state.selection.main;
      view.dispatch({ effects: EditorView.scrollIntoView(from, { y: 'center' }) });
      return where();
    },
    clearFind() {
      active = query();
      total = { count: 0, capped: false };
      view.dispatch({ effects: setSearchQuery.of(active) });
      closeSearchPanel(view);
    },
    setText(text) {
      // Only the span that differs is replaced: text before and after it keeps its place, and the
      // snapshot keeps the scroll position through the change (a file changed on disk).
      const old = view.state.doc.toString();
      if (old === text) return;
      let start = 0;
      const shorter = Math.min(old.length, text.length);
      while (start < shorter && old.charCodeAt(start) === text.charCodeAt(start)) start++;
      let end = 0;
      while (end < shorter - start && old.charCodeAt(old.length - 1 - end) === text.charCodeAt(text.length - 1 - end)) end++;
      view.dispatch({
        changes: { from: start, to: old.length - end, insert: text.slice(start, text.length - end) },
        effects: view.scrollSnapshot(),
        annotations: [fromFile.of(true), Transaction.addToHistory.of(false)],
      });
    },
    setEditable(editable) {
      view.dispatch({ effects: mode.reconfigure(editable ? editing() : reading()) });
    },
    text() {
      return view.state.doc.toString();
    },
    onEdit(listener) {
      editListeners.add(listener);
      return () => editListeners.delete(listener);
    },
    setWrap(wrap) {
      view.dispatch({ effects: wrapping.reconfigure(wrap ? EditorView.lineWrapping : []) });
    },
    topLine,
    scrollToLine(line) {
      const target = view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines));
      view.dispatch({ effects: EditorView.scrollIntoView(target.from, { y: 'start', yMargin: 0 }) });
    },
    scrollToEnd() {
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.length, { y: 'end', yMargin: 0 }) });
    },
    onScrollUp(listener) {
      const scroller = view.scrollDOM;
      let last = scroller.scrollTop;
      const onScroll = () => {
        const top = scroller.scrollTop;
        // The editor corrects its estimated line heights once it measures them, which can move the
        // view up a little while it stays at the end: that isn't the reader leaving it.
        const atEnd = scroller.scrollHeight - scroller.clientHeight - top <= END_SLACK_PX;
        if (top < last && !atEnd) listener();
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
