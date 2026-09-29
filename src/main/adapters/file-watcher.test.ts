import { mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { FsError, type WatchEvent } from '../../core/ports';
import { NodeFileWatcher } from './file-watcher';

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'galeo-watch-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * Repeats `act` until `check` holds. macOS delivers folder events late (FSEvents) and can miss a
 * change made just after watching starts, so a single write can go unreported there.
 */
async function until(act: () => void, check: () => void) {
  await vi.waitFor(
    () => {
      try {
        check();
      } catch (error) {
        act();
        throw error;
      }
    },
    { timeout: 5_000, interval: 250 },
  );
}

function watch(target: string) {
  const events: WatchEvent[] = [];
  const unwatch = new NodeFileWatcher().watch(target, (event) => events.push(event));
  onTestFinished(unwatch);
  return { events, unwatch };
}

describe('NodeFileWatcher', () => {
  it('reports a write to the file', async () => {
    const dir = tempDir();
    const target = path.join(dir, 'settings.json');
    writeFileSync(target, '{}');
    const { events } = watch(target);
    await until(
      () => writeFileSync(target, '{"fontSize":18}'),
      () => expect(events).toContainEqual({ path: target, kind: 'change' }),
    );
  });

  it('reports a file replaced by a rename, as editors and agents save', async () => {
    const dir = tempDir();
    const target = path.join(dir, 'settings.json');
    writeFileSync(target, '{}');
    const { events } = watch(target);
    await until(
      () => {
        writeFileSync(path.join(dir, 'settings.json.tmp'), '{"a":1}');
        renameSync(path.join(dir, 'settings.json.tmp'), target);
      },
      () => expect(events).toContainEqual({ path: target, kind: 'change' }),
    );
  });

  it('reports a file created after watching started, then deleted', async () => {
    const dir = tempDir();
    const target = path.join(dir, 'profile.json');
    const { events } = watch(target);
    await until(
      () => writeFileSync(target, '{}'),
      () => expect(events).toContainEqual({ path: target, kind: 'change' }),
    );
    unlinkSync(target);
    await vi.waitFor(() => expect(events.at(-1)).toEqual({ path: target, kind: 'delete' }));
  });

  it('ignores other files in the folder, and stops when unsubscribed', async () => {
    const dir = tempDir();
    const target = path.join(dir, 'settings.json');
    const sentinel = path.join(dir, 'sentinel');
    const { events, unwatch } = watch(target);
    const control = watch(sentinel);
    await until(
      () => {
        writeFileSync(path.join(dir, 'other.json'), '{}');
        writeFileSync(sentinel, '1');
      },
      () => expect(control.events.length).toBeGreaterThan(0),
    );
    expect(events).toEqual([]);
    unwatch();
    const seen = control.events.length;
    await until(
      () => {
        writeFileSync(target, '{}');
        writeFileSync(sentinel, '2');
      },
      () => expect(control.events.length).toBeGreaterThan(seen),
    );
    expect(events).toEqual([]);
  });

  it('refuses a file whose folder does not exist', () => {
    const dir = tempDir();
    expect(() => new NodeFileWatcher().watch(path.join(dir, 'no', 'x.json'), () => {})).toThrow(FsError);
  });
});
