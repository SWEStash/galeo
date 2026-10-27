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
import { logSpans, type LogPart } from './log-parts';

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

const PART_CLASSES: Record<LogPart, Decoration> = {
  time: Decoration.mark({ class: 'galeo-log-time' }),
  key: Decoration.mark({ class: 'galeo-log-key' }),
  ...(Object.fromEntries(
    (Object.keys(LABELS) as LogLevel[]).map((level) => [`level-${level}`, Decoration.mark({ class: `galeo-log-word-${level}` })]),
  ) as Record<`level-${LogLevel}`, Decoration>),
};

/** Only the lines in view are classified and coloured, so a 100 MB log costs no more than a short one. */
function visibleParts(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let position = from; position <= to; ) {
      const line = view.state.doc.lineAt(position);
      const level = logLevel(line.text);
      if (level) builder.add(line.from, line.from, LINE_CLASSES[level]);
      for (const span of logSpans(line.text)) builder.add(line.from + span.from, line.from + span.to, PART_CLASSES[span.kind]);
      position = line.to + 1;
    }
  }
  return builder.finish();
}

const logColours = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = visibleParts(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.decorations = visibleParts(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** How strongly error and warning lines are tinted with their level's colour, in percent: the most that keeps every colour on them at 4.5:1. */
export const LINE_TINT = { error: 9, warn: 6 } as const;

const theme = EditorView.theme({
  '.galeo-log-gutter .cm-gutterElement': { padding: '0 6px', fontSize: '0.8em', fontWeight: '650' },
  '.galeo-log-badge-error': { color: 'var(--galeo-color-log-error)' },
  '.galeo-log-badge-warn': { color: 'var(--galeo-color-log-warn)' },
  '.galeo-log-badge-info': { color: 'var(--galeo-color-log-info)' },
  '.galeo-log-badge-debug': { color: 'var(--galeo-color-muted)' },
  '.galeo-log-error': { backgroundColor: `color-mix(in srgb, var(--galeo-color-log-error) ${LINE_TINT.error}%, transparent)` },
  '.galeo-log-warn': { backgroundColor: `color-mix(in srgb, var(--galeo-color-log-warn) ${LINE_TINT.warn}%, transparent)` },
  '.galeo-log-debug': { color: 'var(--galeo-color-muted)' },
  '.galeo-log-time': { color: 'var(--galeo-color-muted)' },
  '.galeo-log-key': { color: 'var(--galeo-syntax-constant)' },
  '.galeo-log-word-error': { color: 'var(--galeo-color-log-error)' },
  '.galeo-log-word-warn': { color: 'var(--galeo-color-log-warn)' },
  '.galeo-log-word-info': { color: 'var(--galeo-color-log-info)' },
  '.galeo-log-word-debug': { color: 'var(--galeo-color-muted)' },
});

/** The `.log` view's colours: a level badge gutter, tinted error/warning lines and coloured timestamps, level words and keys. */
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
    logColours,
    theme,
  ];
}
