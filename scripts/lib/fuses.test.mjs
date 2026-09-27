import { describe, expect, it } from 'vitest';
import { fuseMismatches } from './fuses.mjs';

const ENABLE = 49;
const DISABLE = 48;
const expected = { RunAsNode: false, OnlyLoadAppFromAsar: true };

describe('fuseMismatches', () => {
  it('reports nothing when every fuse has its expected state', () => {
    expect(fuseMismatches({ version: '1', 0: DISABLE, 5: ENABLE }, expected)).toEqual([]);
  });

  it('names each fuse in the wrong state', () => {
    expect(fuseMismatches({ version: '1', 0: ENABLE, 5: DISABLE }, expected)).toEqual([
      'RunAsNode is enabled, expected disabled',
      'OnlyLoadAppFromAsar is disabled, expected enabled',
    ]);
  });

  it('reports a fuse the binary does not have', () => {
    expect(fuseMismatches({ version: '1', 0: DISABLE }, expected)).toEqual([
      'OnlyLoadAppFromAsar is missing, expected enabled',
    ]);
  });

  it('refuses an unknown fuse wire version', () => {
    expect(fuseMismatches({ version: '2', 0: DISABLE, 5: ENABLE }, expected)).toEqual(['unknown fuse wire version 2']);
  });
});
