import { describe, expect, it } from 'vitest';
import { parseArgv } from './argv';

const resolve = (cwd: string, file: string) => (file.startsWith('/') ? file : `${cwd}/${file}`);
const parse = (argv: string[], forwarded = false) => parseArgv(argv, { cwd: '/work', forwarded, resolve });

const defaults = { profile: null, newWindow: false, noSandbox: false, sandboxUnavailable: null, files: [] };

describe('parseArgv', () => {
  it('treats empty argv as a plain launch with no files (focus)', () => {
    expect(parse([])).toEqual({ ok: true, args: defaults });
  });

  it('reads the documented flags before the separator', () => {
    expect(parse(['--profile', 'acme', '--new-window', '--', 'a.md'])).toEqual({
      ok: true,
      args: { ...defaults, profile: 'acme', newWindow: true, files: ['/work/a.md'] },
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

  it('accepts plain file names before the separator', () => {
    expect(parse(['a.md', 'b.md'])).toMatchObject({ ok: true, args: { files: ['/work/a.md', '/work/b.md'] } });
  });

  it.each([['--remote-debugging-port=9222'], ['--new-window'], ['-']])(
    'refuses %s after a file name at first launch, because Chromium would act on it',
    (option) => {
      expect(parse(['a.md', option])).toEqual({
        ok: false,
        error: `option after a file name: ${option} (put files after --)`,
      });
    },
  );

  it('keeps a switch-like name after a file name as a file when forwarded', () => {
    expect(parse(['a.md', '--new-window'], true)).toMatchObject({
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

  it.each([
    ['a\u0007b', 'control-character'],
    ['   ', 'empty'],
    ['x'.repeat(65), 'too-long'],
  ])('rejects an unusable profile name %j', (name, reason) => {
    expect(parse(['--profile', name])).toEqual({ ok: false, error: `--profile name: ${reason}` });
  });

  it('keeps a profile name as given, spaces included', () => {
    expect(parse(['--profile', ' Acme Corp '])).toMatchObject({ ok: true, args: { profile: ' Acme Corp ' } });
  });

  it('rejects a repeated --profile', () => {
    expect(parse(['--profile', 'a', '--profile', 'b'])).toEqual({ ok: false, error: '--profile given twice' });
  });

  it.each([
    ['apparmor-userns', 'apparmor-userns'],
    ['suid-helper', 'suid-helper'],
    ['something-new', 'unknown'],
  ])('reads the launcher wrapper cause %s at first launch', (cause, expected) => {
    expect(parse(['--no-sandbox', `--galeo-sandbox-unavailable=${cause}`, '--', 'a.md'])).toMatchObject({
      ok: true,
      args: { noSandbox: true, sandboxUnavailable: expected, files: ['/work/a.md'] },
    });
  });

  it('ignores the launcher wrapper flag when forwarded', () => {
    expect(parse(['--no-sandbox', '--galeo-sandbox-unavailable=suid-helper'], true)).toMatchObject({
      ok: true,
      args: { noSandbox: false, sandboxUnavailable: null },
    });
  });
});

describe('parseArgv, from the Windows galeo command', () => {
  // galeo.cmd runs `galeo.exe --galeo-command -- %*`: Chromium reads no switch after `--`.
  const command = (args: string[], forwarded = false) => parse(['--galeo-command', '--', ...args], forwarded);

  it('reads the flags anywhere before a second separator, as gal does, and the rest as files', () => {
    expect(command(['--profile', 'acme', 'a.md', '--new-window', 'b.md'])).toEqual({
      ok: true,
      args: { ...defaults, profile: 'acme', newWindow: true, files: ['/work/a.md', '/work/b.md'] },
    });
    expect(command(['--profile=acme', '--', '--new-window', '-'], true)).toEqual({
      ok: true,
      args: { ...defaults, profile: 'acme', files: ['/work/--new-window', '/work/-'] },
    });
    expect(command([])).toEqual({ ok: true, args: defaults });
  });

  it.each(['--browser-subprocess-path=x.exe.md', '--no-sandbox', '--galeo-sandbox-unavailable=unknown', '-x'])(
    'refuses %s, an option galeo.cmd has no use for (a glob may have expanded it)',
    (option) => {
      expect(command(['a.md', option])).toEqual({ ok: false, error: `unknown option: ${option}` });
    },
  );

  it('checks --profile as before', () => {
    expect(command(['--profile'])).toEqual({ ok: false, error: '--profile needs a value' });
    expect(command(['--profile', '--new-window'])).toEqual({ ok: false, error: '--profile needs a value' });
    expect(command(['--profile=a', '--profile=b'])).toEqual({ ok: false, error: '--profile given twice' });
  });

  it('takes the marker only first and followed by the separator', () => {
    expect(parse(['--galeo-command', 'a.md'])).toEqual({ ok: false, error: 'unknown option: --galeo-command' });
    expect(parse(['--', '--galeo-command', '--', 'a.md'])).toMatchObject({ ok: true, args: { files: ['/work/--galeo-command', '/work/--', '/work/a.md'] } });
  });
});
