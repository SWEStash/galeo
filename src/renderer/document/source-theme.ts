import { HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

/** Syntax colours from the app's tokens, so the source view follows light and dark. */
export const sourceHighlight = HighlightStyle.define([
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

/** The source view's own look: the app's colours, the code font, and selections that follow the theme. */
export const sourceTheme = EditorView.theme({
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
