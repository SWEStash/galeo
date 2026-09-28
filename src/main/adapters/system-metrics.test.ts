import { describe, expect, it } from 'vitest';
import { windowMemory } from './system-metrics';

describe('windowMemory', () => {
  it("gives each window its renderer process's working set, in bytes", () => {
    const windows = [
      { id: 1, pid: 100 },
      { id: 2, pid: 200 },
    ];
    const metrics = [
      { pid: 100, memory: { workingSetSize: 2048 } },
      { pid: 200, memory: { workingSetSize: 512 } },
      { pid: 300, memory: { workingSetSize: 9999 } },
    ];
    expect(windowMemory(windows, metrics)).toEqual(
      new Map([
        [1, 2048 * 1024],
        [2, 512 * 1024],
      ]),
    );
  });

  it('leaves out a window whose process has no metrics yet', () => {
    expect(windowMemory([{ id: 1, pid: 100 }], [])).toEqual(new Map());
  });
});
