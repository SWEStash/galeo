export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/** Levels are looked for near the start only; long lines are messages, not headers. */
const HEAD_CHARS = 200;

const WORDS: Record<string, LogLevel> = {
  fatal: 'error', critical: 'error', crit: 'error', panic: 'error', emerg: 'error', alert: 'error',
  error: 'error', err: 'error', severe: 'error',
  warning: 'warn', warn: 'warn', wrn: 'warn',
  info: 'info', notice: 'info',
  debug: 'debug', dbg: 'debug', trace: 'debug', verbose: 'debug',
};

const LETTERS: Record<string, LogLevel> = { F: 'error', E: 'error', W: 'warn', I: 'info', D: 'debug', V: 'debug', T: 'debug' };

const SYSLOG: LogLevel[] = ['error', 'error', 'error', 'error', 'warn', 'info', 'info', 'debug'];

// The fixed set of level notations. Each yields the level's token.
const PATTERNS: { pattern: RegExp; level: (match: RegExpExecArray) => LogLevel | undefined }[] = [
  // `level=error`, `"level":"info"`, `severity: WARN`
  {
    pattern: /\b(?:level|lvl|severity)["']?\s*[:=]\s*["']?([a-z]+)\b/i,
    level: (m) => WORDS[m[1]!.toLowerCase()],
  },
  // Plain words: `ERROR`, `[WARN]`, `panic:`
  { pattern: new RegExp(`\\b(${Object.keys(WORDS).join('|')})\\b`, 'i'), level: (m) => WORDS[m[1]!.toLowerCase()] },
  // One-letter tags: `[E]`, and Android's `E/Tag:` at the start of the line
  { pattern: /\[([FEWIDT])\]|^([FEWIDV])\/[\w.$-]+/, level: (m) => LETTERS[(m[1] ?? m[2])!] },
  // Syslog priority: `<3>`
  { pattern: /^<([0-7])>/, level: (m) => SYSLOG[Number(m[1])] },
];

/** A log line's level: the first level notation on the line, or null. */
export function logLevel(line: string): LogLevel | null {
  const head = line.slice(0, HEAD_CHARS);
  let best: { index: number; level: LogLevel } | null = null;
  for (const { pattern, level } of PATTERNS) {
    const match = pattern.exec(head);
    const found = match && level(match);
    if (found && (!best || match.index < best.index)) best = { index: match.index, level: found };
  }
  return best?.level ?? null;
}
