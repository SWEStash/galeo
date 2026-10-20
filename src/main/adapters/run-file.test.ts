import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findProgram, runFile } from './run-file';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A folder holding an executable `name` that prints `says`. */
function program(name: string, says: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'galeo-run-'));
  dirs.push(dir);
  const file = path.join(dir, name);
  writeFileSync(file, `#!/bin/sh\necho ${says}\n`);
  chmodSync(file, 0o755);
  return dir;
}

describe.skipIf(process.platform === 'win32')('finding a program', () => {
  it('looks only in absolute PATH entries, never in the current folder', () => {
    const planted = program('fc-list', 'planted');
    const real = program('fc-list', 'real');
    const cwd = process.cwd();
    process.chdir(planted);
    try {
      expect(findProgram('fc-list', ['', '.', 'bin', real].join(path.delimiter))).toBe(path.join(real, 'fc-list'));
      expect(findProgram('fc-list', ['', '.'].join(path.delimiter))).toBeNull();
    } finally {
      process.chdir(cwd);
    }
  });

  it('skips a file that is there but not executable', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'galeo-run-'));
    dirs.push(dir);
    mkdirSync(path.join(dir, 'sub'));
    writeFileSync(path.join(dir, 'tool'), 'not a program');
    const real = program('tool', 'real');
    expect(findProgram('tool', [dir, real].join(path.delimiter))).toBe(path.join(real, 'tool'));
  });

  it("runs a program found that way, and refuses one it can't find", async () => {
    const real = program('galeo-probe', 'hello');
    const saved = process.env['PATH'];
    process.env['PATH'] = ['.', real].join(path.delimiter);
    try {
      expect(await runFile('galeo-probe', [], { timeout: 5000, maxBuffer: 1024 })).toBe('hello\n');
      await expect(runFile('galeo-missing', [], { timeout: 5000, maxBuffer: 1024 })).rejects.toThrow(/not found/);
    } finally {
      process.env['PATH'] = saved;
    }
  });
});
