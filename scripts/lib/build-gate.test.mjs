import { describe, expect, it, vi } from 'vitest';
import { createBuildGate } from './build-gate.mjs';

describe('createBuildGate', () => {
  it('waits for every first build, in any order, then passes each build through', () => {
    const onBuilt = vi.fn();
    const built = createBuildGate(['main', 'preload'], onBuilt);
    built('preload');
    built('preload');
    expect(onBuilt).not.toHaveBeenCalled();
    built('main');
    expect(onBuilt).toHaveBeenCalledTimes(1);
    built('preload');
    expect(onBuilt).toHaveBeenCalledTimes(2);
  });
});
