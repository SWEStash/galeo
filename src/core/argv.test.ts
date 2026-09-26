import { describe, expect, it } from 'vitest';
import { parseArgv } from './argv';

const resolve = (cwd: string, file: string) => (file.startsWith('/') ? file : `${cwd}/${file}`);
const parse = (argv: string[], forwarded = false) => parseArgv(argv, { cwd: '/work', forwarded, resolve });

const defaults = { profile: null, newWindow: false, noSandbox: false, files: [] };

describe('parseArgv', () => {
  it('treats empty argv as a plain launch with no files (focus)', () => {
    expect(parse([])).toEqual({ ok: true, args: defaults });
  });

  it('reads the documented flags before the separator', () => {
    expect(parse(['--profile', 'acme', '--new-window', '--', 'a.md'])).toEqual({
      ok: true,
      args: { profile: 'acme', newWindow: true, noSandbox: false, files: ['/work/a.md'] },
    });
    expect(parse(['--profile=acme'])).toMatchObject({ ok: true, args: { profile: 'acme' } });
  });

  it('resolves relative files against the sender cwd and keeps absolute ones', () => {
    const result = parseArgv(['--', 'notes/a.md', '/abs/b.md'], {
      cwd: '/elsewhere',
      forwarded: true,
      resolve,
    });
    expect(result).toMatchObject({ ok: true, args: { files: ['/elsewhere/notes/a.md', '/abs/b.md'] } });
  });

  it.each(['--inspect', '--gpu-launcher=x', '--no-sandbox', '--profile', '-', '--'])(
    'treats %s after the separator as a file',
    (name) => {
      expect(parse(['--', name])).toMatchObject({ ok: true, args: { files: [`/work/${name}`], noSandbox: false } });
    },
  );

  it('accepts plain file names before the separator, then stops reading flags', () => {
    expect(parse(['a.md', '--new-window'])).toMatchObject({
      ok: true,
      args: { newWindow: false, files: ['/work/a.md', '/work/--new-window'] },
    });
  });

  it('honours --no-sandbox at first launch', () => {
    expect(parse(['--no-sandbox'])).toMatchObject({ ok: true, args: { noSandbox: true } });
  });

  it('ignores --no-sandbox forwarded from a later launch', () => {
    expect(parse(['--no-sandbox', '--', 'a.md'], true)).toMatchObject({
      ok: true,
      args: { noSandbox: false, files: ['/work/a.md'] },
    });
  });

  it.each([['--inspect'], ['--gpu-launcher=x'], ['-x'], ['--new-window=yes'], ['--no-sandbox=1']])(
    'rejects the unknown or malformed option %s',
    (option) => {
      expect(parse([option, '--', 'a.md'])).toEqual({ ok: false, error: `unknown option: ${option}` });
    },
  );

  it.each([[['--profile']], [['--profile', '--']], [['--profile=']], [['--profile', '--new-window']]])(
    'rejects --profile without a value: %j',
    (argv) => {
      expect(parse(argv)).toEqual({ ok: false, error: '--profile needs a value' });
    },
  );

  it('rejects a repeated --profile', () => {
    expect(parse(['--profile', 'a', '--profile', 'b'])).toEqual({ ok: false, error: '--profile given twice' });
  });
});
