import { RangeSetBuilder, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  gutter,
  GutterMarker,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { logLevel, type LogLevel } from './log-level';

const LABELS: Record<LogLevel, string> = { error: 'ERR', warn: 'WRN', info: 'INF', debug: 'DBG' };

/** Levels carry a text badge as well as a colour, so colour is never the only cue (UX §7). */
class LevelBadge extends GutterMarker {
  constructor(readonly level: LogLevel) {
    super();
  }
  override eq(other: GutterMarker): boolean {
    return other instanceof LevelBadge && other.level === this.level;
  }
  override toDOM(): Node {
    const badge = document.createElement('span');
    badge.className = `galeo-log-badge galeo-log-badge-${this.level}`;
    badge.textContent = LABELS[this.level];
    return badge;
  }
}

const BADGES = Object.fromEntries(
  (Object.keys(LABELS) as LogLevel[]).map((level) => [level, new LevelBadge(level)]),
) as Record<LogLevel, LevelBadge>;

const LINE_CLASSES = Object.fromEntries(
  (Object.keys(LABELS) as LogLevel[]).map((level) => [level, Decoration.line({ class: `galeo-log-${level}` })]),
) as Record<LogLevel, Decoration>;

/** Only the lines in view are classified, so a 100 MB log costs no more than a short one. */
function visibleLevels(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let position = from; position <= to; ) {
      const line = view.state.doc.lineAt(position);
      const level = logLevel(line.text);
      if (level) builder.add(line.from, line.from, LINE_CLASSES[level]);
      position = line.to + 1;
    }
  }
  return builder.finish();
}

const levelLines = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = visibleLevels(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.decorations = visibleLevels(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const theme = EditorView.theme({
  '.galeo-log-gutter .cm-gutterElement': { padding: '0 6px', fontSize: '0.8em', fontWeight: '650' },
  '.galeo-log-badge-error': { color: 'var(--galeo-color-log-error)' },
  '.galeo-log-badge-warn': { color: 'var(--galeo-color-log-warn)' },
  '.galeo-log-badge-info': { color: 'var(--galeo-color-log-info)' },
  '.galeo-log-badge-debug': { color: 'var(--galeo-color-muted)' },
  '.galeo-log-error': { backgroundColor: 'color-mix(in srgb, var(--galeo-color-log-error) 12%, transparent)' },
  '.galeo-log-warn': { backgroundColor: 'color-mix(in srgb, var(--galeo-color-log-warn) 10%, transparent)' },
  '.galeo-log-debug': { color: 'var(--galeo-color-muted)' },
});

/** The `.log` view's level highlighting: a badge gutter and tinted error/warning lines. */
export function logLevels(): Extension {
  return [
    gutter({
      class: 'galeo-log-gutter',
      lineMarker: (view, line) => {
        const level = logLevel(view.state.doc.sliceString(line.from, line.to));
        return level ? BADGES[level] : null;
      },
      initialSpacer: () => BADGES.error,
    }),
    levelLines,
    theme,
  ];
}
