import { RangeSet, StateEffect, StateField, type Text } from '@codemirror/state';
import { Decoration, EditorView, gutterLineClass, GutterMarker, type DecorationSet } from '@codemirror/view';
import type { ChangedRanges } from './change-ranges';

/** A line's change marks (ADR-030): its classes and what a screen reader hears. */
interface LineMark {
  classes: string[];
  words: string[];
}

class ChangedGutter extends GutterMarker {
  override elementClass = 'galeo-changed-gutter';
}
const changedGutter = new ChangedGutter();

const setLineMarks = StateEffect.define<Map<number, LineMark>>();

/** Line number → its marks, for the ranges given; a removal past the last line marks the last line. */
function lineMarks(doc: Text, ranges: ChangedRanges): Map<number, LineMark> {
  const marks = new Map<number, LineMark>();
  const add = (line: number, mark: string, words: string) => {
    const entry = marks.get(line) ?? { classes: [], words: [] };
    entry.classes.push(mark);
    entry.words.push(words);
    marks.set(line, entry);
  };
  for (const [from, to] of ranges.changed) for (let line = from; line <= Math.min(to, doc.lines); line++) add(line, 'galeo-changed', 'changed');
  for (const line of ranges.removedAt) {
    if (line <= doc.lines) add(line, 'galeo-removed-before', 'text removed before this');
    else add(doc.lines, 'galeo-removed-after', 'text removed after this');
  }
  return new Map([...marks].sort(([a], [b]) => a - b));
}

const marksField = StateField.define<{ lines: DecorationSet; gutter: RangeSet<GutterMarker> }>({
  create: () => ({ lines: Decoration.none, gutter: RangeSet.empty }),
  update(value, transaction) {
    let next = { lines: value.lines.map(transaction.changes), gutter: value.gutter.map(transaction.changes) };
    for (const effect of transaction.effects) {
      if (!effect.is(setLineMarks)) continue;
      const doc = transaction.state.doc;
      const at = [...effect.value].map(([line, mark]) => ({ from: doc.line(line).from, mark }));
      next = {
        lines: Decoration.set(at.map(({ from, mark }) => Decoration.line({ class: mark.classes.join(' '), attributes: { 'aria-description': mark.words.join(', ') } }).range(from))),
        gutter: RangeSet.of(at.map(({ from }) => changedGutter.range(from))),
      };
    }
    return next;
  },
  provide: (field) => [EditorView.decorations.from(field, (value) => value.lines), gutterLineClass.from(field, (value) => value.gutter)],
});

/** The source view's part of change marks: add it to the editor's extensions. */
export const changeLines = marksField;

/** Marks the lines a change touched (null: none); returns the marked line numbers, for F7. */
export function markLines(view: EditorView, ranges: ChangedRanges | null): number[] {
  const marks = ranges ? lineMarks(view.state.doc, ranges) : new Map<number, LineMark>();
  view.dispatch({ effects: setLineMarks.of(marks) });
  return [...marks.keys()];
}
