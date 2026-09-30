import { describe, expect, it } from 'vitest';
import { FsError, type FileWatcher, type Unsubscribe, type WatchEvent } from '../../../src/core/ports';
import { CoalescingWatcher } from '../../../src/core/watch/coalescing';
import { FakeClock, FakeFileSystem, FakeFileWatcher } from '../../helpers/fakes';

const FILE = '/w/notes.md';

function setup(inner: FileWatcher = new FakeFileWatcher(), files: Record<string, string> = {}) {
  const clock = new FakeClock(1000);
  const fs = new FakeFileSystem(files);
  const seen: { at: number; kind: WatchEvent['kind'] }[] = [];
  const watcher = new CoalescingWatcher({ inner, clock, fs });
  const stop = watcher.watch(FILE, (event) => seen.push({ at: clock.now(), kind: event.kind }));
  return { clock, fs, seen, watcher, stop };
}

/** A watcher whose folder can't be watched (inotify limit, network file system…). */
class FailingWatcher implements FileWatcher {
  attempts = 0;
  constructor(private failures = Infinity, private readonly then = new FakeFileWatcher()) {}
  watch(path: string, listener: (event: WatchEvent) => void): Unsubscribe {
    this.attempts++;
    if (this.failures-- > 0) throw new FsError('EOTHER', path);
    return this.then.watch(path, listener);
  }
}

describe('CoalescingWatcher', () => {
  it('delivers one event once the file has been quiet for 75 ms', () => {
    const inner = new FakeFileWatcher();
    const { clock, seen } = setup(inner);
    inner.emit({ path: FILE, kind: 'change' });
    clock.advance(74);
    expect(seen).toEqual([]);
    clock.advance(1);
    expect(seen).toEqual([{ at: 1075, kind: 'change' }]);
  });

  it('folds a truncate followed by a write into one delivery', () => {
    const inner = new FakeFileWatcher();
    const { clock, seen } = setup(inner);
    inner.emit({ path: FILE, kind: 'change' });
    clock.advance(10);
    inner.emit({ path: FILE, kind: 'change' });
    clock.advance(1000);
    expect(seen).toEqual([{ at: 1085, kind: 'change' }]);
  });

  it('caps a steady stream at 4 deliveries a second and delivers the end within 250 ms', () => {
    const inner = new FakeFileWatcher();
    const { clock, seen } = setup(inner);
    for (let i = 0; i < 50; i++) {
      inner.emit({ path: FILE, kind: 'change' });
      clock.advance(20);
    }
    const lastEvent = 1000 + 49 * 20;
    clock.advance(1000);
    for (let second = 1000; second < 3000; second += 1000) {
      expect(seen.filter((s) => s.at >= second && s.at < second + 1000).length).toBeLessThanOrEqual(4);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]!.at - seen[i - 1]!.at).toBeGreaterThanOrEqual(250);
    expect(seen.at(-1)!.at - lastEvent).toBeLessThanOrEqual(250);
    expect(seen.length).toBeGreaterThanOrEqual(4);
  });

  it('caps writes that each settle before the next one at 4 deliveries a second', () => {
    const inner = new FakeFileWatcher();
    const { clock, seen } = setup(inner);
    for (let i = 0; i < 20; i++) {
      inner.emit({ path: FILE, kind: 'change' });
      clock.advance(100);
    }
    clock.advance(1000);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!.at - seen[i - 1]!.at).toBeGreaterThanOrEqual(250);
    expect(seen.at(-1)!.at).toBeLessThanOrEqual(1000 + 19 * 100 + 250);
  });

  it('reports the latest kind of a burst', () => {
    const inner = new FakeFileWatcher();
    const { clock, seen } = setup(inner);
    inner.emit({ path: FILE, kind: 'change' });
    inner.emit({ path: FILE, kind: 'delete' });
    clock.advance(100);
    expect(seen).toEqual([{ at: 1075, kind: 'delete' }]);
  });

  it('delivers nothing after unsubscribing, including a pending event', () => {
    const inner = new FakeFileWatcher();
    const { clock, seen, stop } = setup(inner);
    inner.emit({ path: FILE, kind: 'change' });
    stop();
    inner.emit({ path: FILE, kind: 'change' });
    clock.advance(1000);
    expect(seen).toEqual([]);
  });

  it('polls the file when its folder cannot be watched', async () => {
    const { clock, fs, seen } = setup(new FailingWatcher(), { [FILE]: 'one' });
    await settle(clock, 1000);
    expect(seen).toEqual([]);
    fs.write(FILE, 'two, longer');
    await settle(clock, 1000);
    await settle(clock, 100);
    expect(seen.map((s) => s.kind)).toEqual(['change']);
    fs.delete(FILE);
    await settle(clock, 1000);
    await settle(clock, 100);
    expect(seen.map((s) => s.kind)).toEqual(['change', 'delete']);
  });

  it('switches to polling when a running watch is lost, and reports the change that caused it', async () => {
    const inner = new FakeFileWatcher();
    const { clock, fs, seen } = setup(inner, { [FILE]: 'one' });
    inner.emit({ path: FILE, kind: 'lost' });
    await settle(clock, 100);
    expect(seen.map((s) => s.kind)).toEqual(['change']);
    fs.write(FILE, 'two, longer');
    await settle(clock, 1000);
    await settle(clock, 100);
    expect(seen.map((s) => s.kind)).toEqual(['change', 'change']);
  });

  it('goes back to watching once the folder can be watched again', async () => {
    const recovered = new FakeFileWatcher();
    const inner = new FailingWatcher(1, recovered);
    const { clock, seen } = setup(inner);
    await settle(clock, 1000);
    expect(inner.attempts).toBe(2);
    recovered.emit({ path: FILE, kind: 'change' });
    await settle(clock, 100);
    expect(seen.map((s) => s.kind)).toEqual(['change']);
    await settle(clock, 5000);
    expect(inner.attempts).toBe(2);
  });
});

/** Advances the clock, then lets the polled `stat` promises resolve. */
async function settle(clock: FakeClock, ms: number): Promise<void> {
  clock.advance(ms);
  for (let i = 0; i < 5; i++) await Promise.resolve();
}
