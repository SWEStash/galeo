import { afterEach, describe, expect, it, vi } from 'vitest';
import { growingLog } from '../../../src/demo/growing-log';

afterEach(() => void vi.useRealTimers());

describe('growingLog (the demo)', () => {
  it('adds one timestamped line per tick, then stops when its lines run out', () => {
    vi.useFakeTimers();
    const lines: string[] = [];
    growingLog((line) => lines.push(line), 1000, Date.parse('2026-11-13T08:24:00Z'));
    vi.advanceTimersByTime(2000);
    expect(lines).toEqual(['2026-11-13T08:24:00Z INFO  truck: on the ring road, ETA 09:05\n', '2026-11-13T08:27:00Z INFO  truck: traffic slow at the bridge, ETA 09:12\n']);
    vi.advanceTimersByTime(60_000);
    expect(lines).toHaveLength(12);
    expect(lines.at(-1)).toContain('delivered');
    expect(vi.getTimerCount()).toBe(0);
  });
});
