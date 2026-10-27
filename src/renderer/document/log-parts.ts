import { findLevel, HEAD_CHARS, type LogLevel } from './log-level';

export type LogPart = 'time' | `level-${LogLevel}` | 'key';

export interface LogSpan {
  from: number;
  to: number;
  kind: LogPart;
}

/** Keys are looked for this far into a line, so a huge one-line log costs no more than a short line. */
const KEY_CHARS = 2000;

// A fixed set of timestamp forms, looked for in the head of the line.
const TIMES: RegExp[] = [
  // ISO 8601, with `T` or a space: `2026-10-26T12:00:01.123Z`, `2026-10-26 12:00:01,123`
  /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/,
  // Syslog: `Oct 26 12:00:01`, `Oct  6 12:00:01`
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d{2}:\d{2}:\d{2}\b/,
  // A clock at the start of the line: `12:00:01.5`, `[12:00:01]`
  /(?<=^\[?)\d{2}:\d{2}:\d{2}(?:[.,]\d+)?/,
];

// Keys: logfmt's `key=` at the start or after a space (not a URL's `?a=b`), and JSON's `"key":`.
const KEYS = [/(?<=^|\s)[A-Za-z_][\w.-]*(?==(?!=))/g, /"[^"\\\n]*"(?=\s*:)/g];

function firstTime(head: string): LogSpan | null {
  let best: LogSpan | null = null;
  for (const pattern of TIMES) {
    const match = pattern.exec(head);
    if (match && (!best || match.index < best.from)) best = { from: match.index, to: match.index + match[0].length, kind: 'time' };
  }
  return best;
}

/** The parts of a log line that take a colour: its timestamp, its level and the keys of its key=value pairs. */
export function logSpans(line: string): LogSpan[] {
  const spans: LogSpan[] = [];
  // Earlier kinds win where two would overlap.
  const add = (span: LogSpan) => {
    if (!spans.some((other) => span.from < other.to && other.from < span.to)) spans.push(span);
  };
  const time = firstTime(line.slice(0, HEAD_CHARS));
  if (time) add(time);
  const level = findLevel(line);
  if (level) add({ from: level.from, to: level.to, kind: `level-${level.level}` });
  const start = line.slice(0, KEY_CHARS);
  for (const pattern of KEYS) {
    for (const match of start.matchAll(pattern)) add({ from: match.index, to: match.index + match[0].length, kind: 'key' });
  }
  return spans.sort((a, b) => a.from - b.from);
}
