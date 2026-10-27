import { describe, expect, it } from 'vitest';
import { WindowCleanups } from '../../../src/main/window/cleanups';

describe('WindowCleanups', () => {
  it('lets go of a closed window in every registered place, in the order they registered', () => {
    const cleanups = new WindowCleanups();
    const log: string[] = [];
    cleanups.add((window) => void log.push(`tabs ${window}`));
    cleanups.add((window) => void log.push(`grants ${window}`));
    cleanups.add((window) => void log.push(`drops ${window}`));
    cleanups.run(3);
    expect(log).toEqual(['tabs 3', 'grants 3', 'drops 3']);
  });

  it('runs again for each window that closes', () => {
    const cleanups = new WindowCleanups();
    const closed: number[] = [];
    cleanups.add((window) => void closed.push(window));
    cleanups.run(1);
    cleanups.run(2);
    expect(closed).toEqual([1, 2]);
  });
});
