import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { demoFiles, demoSizeProblems } from './demo-size.mjs';

const dirs = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('demo size budget (#41)', () => {
  it('lists every file under the folder, largest first', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'galeo-demo-size-'));
    dirs.push(dir);
    mkdirSync(path.join(dir, 'assets'));
    writeFileSync(path.join(dir, 'index.html'), 'x'.repeat(10));
    writeFileSync(path.join(dir, 'assets', 'a.js'), 'x'.repeat(30));
    expect(demoFiles(dir)).toEqual([
      { file: path.join('assets', 'a.js'), bytes: 30 },
      { file: 'index.html', bytes: 10 },
    ]);
  });

  it('passes under the budget, and names a total over it and any source map', () => {
    expect(demoSizeProblems([{ file: 'a.js', bytes: 50 }], 100)).toEqual([]);
    expect(demoSizeProblems([{ file: 'a.js', bytes: 150 }, { file: 'a.js.map', bytes: 1 }], 100)).toEqual([
      "a.js.map: source maps aren't published",
      'the demo is 0.0 MB, over its 0 MB budget',
    ]);
  });
});
