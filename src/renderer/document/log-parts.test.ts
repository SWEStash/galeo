import { describe, expect, it } from 'vitest';
import { logSpans } from './log-parts';

/** The line with each coloured part in brackets, tagged with its kind. */
function marked(line: string): string {
  let out = '';
  let at = 0;
  for (const { from, to, kind } of logSpans(line)) {
    out += `${line.slice(at, from)}[${kind}:${line.slice(from, to)}]`;
    at = to;
  }
  return out + line.slice(at);
}

describe('logSpans', () => {
  it.each([
    ['2026-10-26T12:00:01.123Z INFO started', '[time:2026-10-26T12:00:01.123Z] [level-info:INFO] started'],
    ['2026-10-26 12:00:01,123 WARN slow', '[time:2026-10-26 12:00:01,123] [level-warn:WARN] slow'],
    ['2026-10-26T12:00:01+02:00 ERROR boom', '[time:2026-10-26T12:00:01+02:00] [level-error:ERROR] boom'],
    ['[2026-10-26 12:00:01] [DEBUG] tick', '[[time:2026-10-26 12:00:01]] [[level-debug:DEBUG]] tick'],
    ['Oct 26 12:00:01 host sshd[42]: error', '[time:Oct 26 12:00:01] host sshd[42]: [level-error:error]'],
    ['<3>Oct  6 12:00:01 host daemon', '[level-error:<3>][time:Oct  6 12:00:01] host daemon'],
    ['12:00:01.5 DEBUG cache miss', '[time:12:00:01.5] [level-debug:DEBUG] cache miss'],
  ])('colours the timestamp and the level in %s', (line, expected) => {
    expect(marked(line)).toBe(expected);
  });

  it('colours the keys of key=value pairs, the level value in its own colour', () => {
    expect(marked('ts=1 level=warn msg="disk at 91%" path=/var/log')).toBe('[key:ts]=1 [key:level]=[level-warn:warn] [key:msg]="disk at 91%" [key:path]=/var/log');
  });

  it('colours the keys of JSON lines', () => {
    expect(marked('{"time":"2026-10-26T12:00:01Z","level":"info","msg":"ok"}')).toBe(
      '{[key:"time"]:"[time:2026-10-26T12:00:01Z]",[key:"level"]:"[level-info:info]",[key:"msg"]:"ok"}',
    );
  });

  it('leaves prose, URL queries and durations alone', () => {
    expect(marked('    at handler (server.js:42:7)')).toBe('    at handler (server.js:42:7)');
    expect(marked('fetched https://example.test/a?b=c&d=e in 00:00:05')).toBe('fetched https://example.test/a?b=c&d=e in 00:00:05');
    expect(marked('Note: x == y, and a=b only after a space')).toBe('Note: x == y, and [key:a]=b only after a space');
  });

  it('gives a part one colour where two would overlap: time, then level, then key', () => {
    expect(marked('err="x" ok')).toBe('[level-error:err]="x" ok');
  });

  it('looks for keys only near the start of a very long line', () => {
    const line = `${'x'.repeat(5000)} late=1`;
    expect(logSpans(line)).toEqual([]);
  });

  it('returns nothing for an empty line', () => {
    expect(logSpans('')).toEqual([]);
  });
});
