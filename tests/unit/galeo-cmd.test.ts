import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseArgv } from '../../src/core/argv';
import { appCommand } from '../../src/core/desktop/launcher';

// The Windows `galeo.cmd`, run by cmd as a user would, pointed at a stand-in that prints the
// arguments galeo.exe would get.
describe.runIf(process.platform === 'win32')('galeo.cmd', () => {
  let dir = '';
  let galeoCmd = '';

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'galeo-cmd-'));
    const print = path.join(dir, 'print.js');
    writeFileSync(print, 'console.log(JSON.stringify(process.argv.slice(2)));\n');
    const standIn = path.join(dir, 'stand-in.cmd');
    writeFileSync(standIn, `@"${process.execPath}" "${print}" %*\r\n`);
    const command = appCommand('win32', standIn, dir, null);
    if (!command.ok) throw new Error(command.reason);
    writeFileSync(command.path, command.content);
    galeoCmd = command.path;
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function run(typed: string): string[] {
    const result = spawnSync('cmd.exe', ['/d', '/s', '/c', `""${galeoCmd}" ${typed}"`], {
      cwd: dir,
      encoding: 'utf8',
      windowsVerbatimArguments: true,
    });
    expect(result.stderr).toBe('');
    return JSON.parse(result.stdout) as string[];
  }

  it('hands every argument over after the marker and --, as typed', () => {
    expect(run('--profile=acme "my notes.md" a=b.md')).toEqual(['--galeo-command', '--', '--profile=acme', 'my notes.md', 'a=b.md']);
  });

  it('keeps a switch-like file name from Chromium, and galeo refuses it', () => {
    const argv = run('a.md --browser-subprocess-path=x.exe.md');
    expect(argv.slice(0, 2)).toEqual(['--galeo-command', '--']);
    expect(parseArgv(argv, { cwd: dir, forwarded: false, resolve: path.resolve })).toEqual({
      ok: false,
      error: 'unknown option: --browser-subprocess-path=x.exe.md',
    });
  });
});
