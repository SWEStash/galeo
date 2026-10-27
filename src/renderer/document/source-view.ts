import { addCursorAbove, addCursorBelow, defaultKeymap, history, historyKeymap, standardKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { foldGutter, foldKeymap, HighlightStyle, LanguageDescription, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  openSearchPanel,
  replaceAll,
  replaceNext,
  search,
  SearchQuery,
  searchPanelOpen,
  selectNextOccurrence,
  selectSelectionMatches,
  setSearchQuery,
} from '@codemirror/search';
import { Annotation, Compartment, EditorSelection, EditorState, Transaction, type Extension, type Text } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLineGutter, keymap, lineNumbers, rectangularSelection, type KeyBinding } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { takenByDesktop } from '../../shared/desktop-keys';
import type { OutlineEntry } from '../worker/pipeline/render';
import { logLevels } from './log-view';
import { sourceOutline } from './source-outline';
import { clamp, clamp01 } from '../../shared/math';
import type { FindResult } from '../../shared/find';

/** `markdown` and `log` are built in; any other name is a grammar from `@codemirror/language-data`. */
export type SourceLanguage = 'markdown' | 'log' | (string & {}) | null;

export interface FindOptions {
  caseSensitive: boolean;
  /** Start at this 1-based source line instead of the reading position (a match from find in all tabs). */
  line?: number | undefined;
}

/** How close to the end still counts as at the end. */
const END_SLACK_PX = 4;

/** The outline follows the text this long after it stops changing (typing, a large file's parsing). */
const OUTLINE_DELAY_MS = 150;

/** Counting stops here, so a common word in a 100 MB log doesn't stall the find bar. */
const FIND_CAP = 10_000;

export interface SourceView {
  readonly view: EditorView;
  /** Settles once the language's grammar is in (at once for Markdown, logs and plain text). */
  readonly grammar: Promise<void>;
  setText(text: string): void;
  setWrap(wrap: boolean): void;
  /** The line at the top of the viewport. */
  topLine(): number;
  scrollToLine(line: number): void;
  /** Puts the cursor at a 1-based line and column (kept inside the text) and scrolls it into view. */
  select(line: number, column: number): void;
  /** The line at the top of the viewport, with how far into it as the fraction (split's sync). */
  topPosition(): number;
  /** Scrolls a fractional line (`topPosition`'s) to the top. */
  scrollToPosition(position: number): void;
  scrollToEnd(): void;
  /** Highlights `query` and selects the first match from the reading position on. */
  find(query: string, options: FindOptions): FindResult;
  findStep(direction: 1 | -1): FindResult;
  clearFind(): void;
  /** Edit mode: replaces the current match with `text` (as typed) and selects the next one. */
  replace(text: string): FindResult;
  /** Edit mode: replaces every match (no cap) as one undo step; how many it replaced. */
  replaceAll(text: string): number;
  /** Edit mode (ADR-013): the reader's typing changes the text; otherwise it's read-only. */
  setEditable(editable: boolean): void;
  /** The text as shown now, with the reader's edits. */
  text(): string;
  /** Calls `listener` after each edit of the reader's (never for new text from the file). */
  onEdit(listener: () => void): () => void;
  /** The YAML or TOML outline of the text as it is now; empty for other languages. */
  outline(): OutlineEntry[];
  /** Calls `listener` with the outline when the grammar arrives and as the text changes. */
  onOutline(listener: (entries: OutlineEntry[]) => void): () => void;
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
  // Code, YAML, TOML and JSON.
  { tag: [tags.keyword, tags.operatorKeyword], color: 'var(--galeo-syntax-keyword)' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp, tags.character, tags.inserted], color: 'var(--galeo-syntax-string)' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom, tags.unit, tags.constant(tags.name), tags.propertyName, tags.attributeName], color: 'var(--galeo-syntax-constant)' },
  { tag: tags.comment, color: 'var(--galeo-syntax-comment)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.definition(tags.function(tags.variableName))], color: 'var(--galeo-syntax-function)' },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.tagName, tags.definition(tags.propertyName)], color: 'var(--galeo-syntax-type)' },
  { tag: [tags.definition(tags.variableName), tags.self, tags.changed], color: 'var(--galeo-syntax-variable)' },
  { tag: [tags.invalid, tags.deleted], color: 'var(--galeo-syntax-invalid)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--galeo-color-fg)', backgroundColor: 'var(--galeo-color-bg)' },
  '.cm-scroller': { fontFamily: 'var(--galeo-font-code)', fontSize: '14px', lineHeight: '1.5' },
  '.cm-gutters': { backgroundColor: 'var(--galeo-color-bg)', color: 'var(--galeo-color-muted)', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--galeo-color-fg)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': { caretColor: 'var(--galeo-color-fg)' },
  // Edit mode draws its own selections and cursors (several at once); they follow light/dark too.
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--galeo-color-fg)' },
  '& .cm-selectionLayer .cm-selectionBackground': { background: 'color-mix(in srgb, var(--galeo-color-focus) 18%, transparent)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    background: 'color-mix(in srgb, var(--galeo-color-focus) 30%, transparent)',
  },
  '.cm-searchMatch': { backgroundColor: 'var(--galeo-color-mark)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--galeo-color-mark-current)', color: '#1f2328' },
});

/** Marks the file's own text arriving (`setText`), which isn't an edit and can't be undone. */
const fromFile = Annotation.define<boolean>();

/** A line number within the document's lines. */
const lineIn = (doc: Text, line: number) => clamp(line, 1, doc.lines);

/**
 * Read-only, or editing: undo history and the editing keys, before the reading keys. The window's
 * own keys still come first: the app takes them in the capture phase and CodeMirror skips a key
 * already handled, so only keys the app declines (typing, Alt+arrows) reach the editor.
 */
const reading = (): Extension => EditorState.readOnly.of(true);

/**
 * CodeMirror's keys the Linux desktop keeps (UX §5): GNOME switches workspaces with Ctrl+Alt+↑/↓,
 * and Ctrl+Alt is the desktop's. Adding a cursor above/below takes Shift+Alt+↑/↓ instead, in place
 * of copying the line.
 */
const DESKTOP_KEYS = new Set(['Mod-Alt-ArrowUp', 'Mod-Alt-ArrowDown', 'Mod-Alt-\\', 'Shift-Alt-ArrowUp', 'Shift-Alt-ArrowDown']);

/** The keys edit mode adds: editing, undo, and multiple cursors. */
export const editingKeys: readonly KeyBinding[] = [
  ...defaultKeymap.filter((binding) => !DESKTOP_KEYS.has(binding.key ?? '')),
  ...historyKeymap,
  { key: 'Shift-Alt-ArrowUp', run: addCursorAbove },
  { key: 'Shift-Alt-ArrowDown', run: addCursorBelow },
  { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
  { key: 'Mod-Shift-l', run: selectSelectionMatches },
];

// Several cursors (Ctrl+click, Alt+drag, the keys above) need drawing: the browser shows only one.
const editing = (): Extension => [
  history(),
  keymap.of(editingKeys),
  EditorState.allowMultipleSelections.of(true),
  drawSelection(),
  rectangularSelection(),
];

const BUILT_IN: Readonly<Record<string, () => Extension>> = {
  markdown: () => markdown(),
  log: () => logLevels(),
};

const builtIn = (language: SourceLanguage) => language !== null && Object.hasOwn(BUILT_IN, language);

/** Folding and unfolding the block at the cursor; CodeMirror's fold-all keys are Ctrl+Alt, the desktop's (UX §5). */
export const foldingKeys: readonly KeyBinding[] = foldKeymap.filter((binding) => !takenByDesktop((binding.key ?? '').replaceAll('-', '+')));

/** Where a grammar goes once it has loaded (with the source view's fold markers). */
const grammarSlot = new Compartment();

const grammars = new Map<string, Promise<Extension | null>>();

/** The grammar `@codemirror/language-data` lists under `name`, each loaded once (its own chunk). */
export function loadGrammar(name: string): Promise<Extension | null> {
  let grammar = grammars.get(name);
  if (!grammar) {
    grammar = import('@codemirror/language-data').then(async ({ languages }) => {
      const description = LanguageDescription.matchLanguageName(languages, name, false);
      return description ? description.load() : null;
    });
    grammars.set(name, grammar);
  }
  return grammar;
}

/**
 * Gives views their language's grammar, and `extras` with it, once it has loaded; the text shows
 * before that, unhighlighted. A grammar that fails to load leaves the text plain. `open` says
 * whether the views are still shown.
 */
export async function addGrammar(views: readonly EditorView[], language: SourceLanguage, open: () => boolean, extras: Extension = []): Promise<void> {
  if (!language || builtIn(language)) return;
  const grammar = await loadGrammar(language).catch(() => null);
  if (!grammar || !open()) return;
  for (const view of views) view.dispatch({ effects: grammarSlot.reconfigure([grammar, extras]) });
}

/** How source text looks, in the source view and in the diff of unsaved edits. */
export const sourceLook = (language: SourceLanguage): Extension => [
  syntaxHighlighting(highlight),
  theme,
  builtIn(language) ? BUILT_IN[language!]!() : [],
  grammarSlot.of([]),
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
  const outlineListeners = new Set<(entries: OutlineEntry[]) => void>();
  let outlineTimer: ReturnType<typeof setTimeout> | undefined;
  const findCap = options.findCap ?? FIND_CAP;
  let total = { count: 0, capped: false };
  let open = true;
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
          if (outlineListeners.size > 0 && syntaxTree(update.state) !== syntaxTree(update.startState)) {
            clearTimeout(outlineTimer);
            outlineTimer = setTimeout(() => {
              const entries = sourceOutline(view.state);
              for (const listener of outlineListeners) listener(entries);
            }, OUTLINE_DELAY_MS);
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

  // `documentTop` already moves with scrolling: the viewport top is this far into the document.
  const viewportTop = () => view.scrollDOM.getBoundingClientRect().top - view.documentTop;
  const topLine = () => view.state.doc.lineAt(view.lineBlockAtHeight(viewportTop()).from).number;

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

  const recount = () => {
    let count = 0;
    const counter = active.getCursor(view.state);
    while (count < findCap && !counter.next().done) count++;
    total = { count, capped: count >= findCap && !counter.next().done };
  };

  /** The active query, replacing its matches with `text`. */
  const replacing = (text: string) => {
    active = new SearchQuery({ search: active.search, caseSensitive: active.caseSensitive, literal: true, replace: text });
    view.dispatch({ effects: setSearchQuery.of(active) });
  };

  const reveal = (from: number, to: number) =>
    view.dispatch({
      selection: EditorSelection.single(from, to),
      // The current match goes to the middle of the view (UX F9).
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    });

  return {
    view,
    grammar: addGrammar([view], options.language, () => open, [foldGutter(), keymap.of(foldingKeys)]),
    find(text, { caseSensitive, line }) {
      active = new SearchQuery({ search: text, caseSensitive, literal: true });
      if (!searchPanelOpen(view.state)) openSearchPanel(view);
      view.dispatch({ effects: setSearchQuery.of(active) });
      if (!text) {
        total = { count: 0, capped: false };
        return where();
      }
      recount();
      // From the given line, else from the reading position.
      const start = view.state.doc.line(line === undefined ? topLine() : lineIn(view.state.doc, line)).from;
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
    replace(text) {
      if (total.count === 0) return where();
      replacing(text);
      replaceNext(view);
      recount();
      return where();
    },
    replaceAll(text) {
      if (total.count === 0 || view.state.readOnly) return 0;
      let replaced = 0;
      for (const cursor = active.getCursor(view.state); !cursor.next().done; ) replaced++;
      replacing(text);
      replaceAll(view);
      recount();
      return replaced;
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
    topPosition() {
      const height = viewportTop();
      const block = view.lineBlockAtHeight(height);
      const into = block.height > 0 ? clamp01((height - block.top) / block.height) : 0;
      return view.state.doc.lineAt(block.from).number + into;
    },
    scrollToPosition(position) {
      const { doc } = view.state;
      const number = lineIn(doc, Math.floor(position));
      const block = view.lineBlockAt(doc.line(number).from);
      const into = number === Math.floor(position) ? position - number : 0;
      // The document starts this far down the scrolled content (the editor's top padding).
      const start = view.scrollDOM.scrollTop - viewportTop();
      view.scrollDOM.scrollTop = start + block.top + into * block.height;
    },
    scrollToLine(line) {
      const target = view.state.doc.line(lineIn(view.state.doc, line));
      view.dispatch({ effects: EditorView.scrollIntoView(target.from, { y: 'start', yMargin: 0 }) });
    },
    select(line, column) {
      const target = view.state.doc.line(lineIn(view.state.doc, line));
      const at = Math.min(target.from + Math.max(column, 1) - 1, target.to);
      view.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'center' }) });
    },
    scrollToEnd() {
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.length, { y: 'end', yMargin: 0 }) });
    },
    outline() {
      return sourceOutline(view.state);
    },
    onOutline(listener) {
      outlineListeners.add(listener);
      return () => outlineListeners.delete(listener);
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
      open = false;
      clearTimeout(outlineTimer);
      view.destroy();
    },
  };
}
