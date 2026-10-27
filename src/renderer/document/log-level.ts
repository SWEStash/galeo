export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/** Levels are looked for near the start only; long lines are messages, not headers. */
export const HEAD_CHARS = 200;

const WORDS: Record<string, LogLevel> = {
  fatal: 'error', critical: 'error', crit: 'error', panic: 'error', emerg: 'error', alert: 'error',
  error: 'error', err: 'error', severe: 'error',
  warning: 'warn', warn: 'warn', wrn: 'warn',
  info: 'info', notice: 'info',
  debug: 'debug', dbg: 'debug', trace: 'debug', verbose: 'debug',
};

const LETTERS: Record<string, LogLevel> = { F: 'error', E: 'error', W: 'warn', I: 'info', D: 'debug', V: 'debug', T: 'debug' };

const SYSLOG: LogLevel[] = ['error', 'error', 'error', 'error', 'warn', 'info', 'info', 'debug'];

// The fixed set of level notations. Each captures the level's text (`d`: with its place) and yields its level.
const PATTERNS: { pattern: RegExp; level: (text: string) => LogLevel | undefined }[] = [
  // `level=error`, `"level":"info"`, `severity: WARN`
  { pattern: /\b(?:level|lvl|severity)["']?\s*[:=]\s*["']?([a-z]+)\b/di, level: (text) => WORDS[text.toLowerCase()] },
  // Plain words: `ERROR`, `[WARN]`, `panic:`
  { pattern: new RegExp(`\\b(${Object.keys(WORDS).join('|')})\\b`, 'di'), level: (text) => WORDS[text.toLowerCase()] },
  // One-letter tags: `[E]`, and Android's `E/Tag:` at the start of the line
  { pattern: /\[([FEWIDT])\]|^([FEWIDV])\/[\w.$-]+/d, level: (text) => LETTERS[text] },
  // Syslog priority: `<3>`
  { pattern: /^(<[0-7]>)/d, level: (text) => SYSLOG[Number(text[1])] },
];

interface FoundLevel {
  level: LogLevel;
  /** Where the level's own text is on the line. */
  from: number;
  to: number;
}

/** A log line's level and where it is: the first level notation on the line, or null. */
export function findLevel(line: string): FoundLevel | null {
  const head = line.slice(0, HEAD_CHARS);
  let best: FoundLevel | null = null;
  let bestStart = Infinity;
  for (const { pattern, level } of PATTERNS) {
    const match = pattern.exec(head);
    if (!match || match.index >= bestStart) continue;
    const group = match[1] === undefined ? 2 : 1;
    const found = level(match[group]!);
    if (!found) continue;
    const [from, to] = match.indices![group]!;
    best = { level: found, from, to };
    bestStart = match.index;
  }
  return best;
}

/** A log line's level: the first level notation on the line, or null. */
export function logLevel(line: string): LogLevel | null {
  return findLevel(line)?.level ?? null;
}
