import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const LAUNCHER = path.resolve(import.meta.dirname, '../../bin/gal');
const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'galeo-launcher-')));
const stub = path.join(dir, 'galeo');
writeFileSync(stub, '#!/bin/sh\nfor a in "$@"; do printf "%s\\n" "$a"; done\n');
chmodSync(stub, 0o755);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function gal(...args: string[]) {
  const result = spawnSync('sh', [LAUNCHER, ...args], {
    cwd: dir,
    env: { ...process.env, GALEO_BIN: stub },
    encoding: 'utf8',
  });
  return { status: result.status, argv: result.stdout.split('\n').slice(0, -1), stderr: result.stderr };
}

describe.skipIf(process.platform === 'win32')('bin/gal', () => {
  it('passes files after the separator as absolute paths', () => {
    expect(gal('a.md', 'my notes.md', '/abs/c.md').argv).toEqual([
      '--',
      path.join(dir, 'a.md'),
      path.join(dir, 'my notes.md'),
      '/abs/c.md',
    ]);
  });

  it('forwards the documented flags before the separator', () => {
    expect(gal('--profile', 'acme', '--new-window', '--no-sandbox', 'a.md').argv).toEqual([
      '--profile',
      'acme',
      '--new-window',
      '--no-sandbox',
      '--',
      path.join(dir, 'a.md'),
    ]);
    expect(gal('--profile=acme').argv).toEqual(['--profile=acme', '--']);
  });

  it('reads its flags after file names too, until the separator', () => {
    expect(gal('a.md', '--new-window', 'b.md', '--profile', 'acme').argv).toEqual([
      '--new-window',
      '--profile',
      'acme',
      '--',
      path.join(dir, 'a.md'),
      path.join(dir, 'b.md'),
    ]);
    expect(gal('a.md', '--', '--new-window').argv).toEqual(['--', path.join(dir, 'a.md'), path.join(dir, '--new-window')]);
  });

  it("passes the launcher wrapper's relaunch flag through", () => {
    expect(gal('--no-sandbox', '--galeo-sandbox-unavailable=suid-helper', 'a.md').argv).toEqual([
      '--no-sandbox',
      '--galeo-sandbox-unavailable=suid-helper',
      '--',
      path.join(dir, 'a.md'),
    ]);
  });

  it('keeps switch-like names after the user separator as files', () => {
    expect(gal('--', '--inspect', '--gpu-launcher=x').argv).toEqual([
      '--',
      path.join(dir, '--inspect'),
      path.join(dir, '--gpu-launcher=x'),
    ]);
  });

  it('launches with only the separator when given nothing', () => {
    expect(gal().argv).toEqual(['--']);
  });

  it.each([[['--inspect', 'a.md']], [['a.md', '--inspect']], [['a.md', '--profile']], [['--profile']], [['--profile=']]])('refuses %j without starting the app', (args) => {
    const result = gal(...args);
    expect(result.status).toBe(2);
    expect(result.argv).toEqual([]);
    expect(result.stderr).toMatch(/^galeo: /);
  });
});
