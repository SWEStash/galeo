import { describe, expect, it } from 'vitest';
import { findLevel, logLevel } from './log-level';

describe('logLevel', () => {
  it.each([
    ['2026-09-27T12:00:00Z ERROR request failed', 'error'],
    ['2026-09-27 12:00:00 [WARN] slow response', 'warn'],
    ['INFO server started', 'info'],
    ['12:00:01 DEBUG cache miss', 'debug'],
    ['12:00:01 TRACE entering handler', 'debug'],
    ['FATAL out of memory', 'error'],
    ['CRITICAL disk full', 'error'],
    ['panic: runtime error', 'error'],
    ['WARNING: deprecated flag', 'warn'],
    ['[E] parse failed', 'error'],
    ['[W] retrying', 'warn'],
    ['E/ActivityManager: ANR in com.example', 'error'],
    ['W/System: slow', 'warn'],
    ['I/Choreographer: skipped frames', 'info'],
    ['D/net: connected', 'debug'],
    ['time=12:00 level=error msg="boom"', 'error'],
    ['ts=1 level=warn msg=x', 'warn'],
    ['{"time":"12:00","level":"info","msg":"ok"}', 'info'],
    ['{"severity":"ERROR","message":"x"}', 'error'],
    ['<3>Sep 27 12:00:00 host daemon: error', 'error'],
  ] as const)('reads %s as %s', (line, level) => {
    expect(logLevel(line)).toBe(level);
  });

  it('takes the first level on the line, so a message mentioning another level keeps its own', () => {
    expect(logLevel('12:00 INFO no error found')).toBe('info');
    expect(logLevel('12:00 DEBUG retry after warning')).toBe('debug');
  });

  it('matches level words case-insensitively but only as whole words', () => {
    expect(logLevel('12:00 error: boom')).toBe('error');
    expect(logLevel('terrorism report')).toBeNull();
    expect(logLevel('information desk')).toBeNull();
    expect(logLevel('debugger attached')).toBeNull();
  });

  it('returns null for lines without a level', () => {
    expect(logLevel('')).toBeNull();
    expect(logLevel('    at Object.<anonymous> (index.js:1:1)')).toBeNull();
    expect(logLevel('Everything is fine.')).toBeNull();
  });

  it('only looks at the start of very long lines', () => {
    expect(logLevel(`${'x '.repeat(200)}ERROR late`)).toBeNull();
  });
});

describe('findLevel', () => {
  /** The line with the level's text in brackets. */
  const marked = (line: string) => {
    const found = findLevel(line);
    return found && `${found.level}: ${line.slice(0, found.from)}[${line.slice(found.from, found.to)}]${line.slice(found.to)}`;
  };

  it.each([
    ['2026-09-27T12:00:00Z ERROR request failed', 'error: 2026-09-27T12:00:00Z [ERROR] request failed'],
    ['2026-09-27 12:00:00 [WARN] slow response', 'warn: 2026-09-27 12:00:00 [[WARN]] slow response'],
    ['time=12:00 level=error msg="boom"', 'error: time=12:00 level=[error] msg="boom"'],
    ['{"time":"12:00","level":"info","msg":"ok"}', 'info: {"time":"12:00","level":"[info]","msg":"ok"}'],
    ['[E] parse failed', 'error: [[E]] parse failed'],
    ['E/ActivityManager: ANR', 'error: [E]/ActivityManager: ANR'],
    ['<3>Sep 27 12:00:00 host daemon: error', 'error: [<3>]Sep 27 12:00:00 host daemon: error'],
  ])('finds the level in %s', (line, expected) => {
    expect(marked(line)).toBe(expected);
  });

  it('finds nothing where logLevel finds nothing', () => {
    expect(findLevel('Everything is fine.')).toBeNull();
  });
});
