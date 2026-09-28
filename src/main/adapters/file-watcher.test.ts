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
    writeFileSync(target, '{"fontSize":18}');
    await vi.waitFor(() => expect(events).toContainEqual({ path: target, kind: 'change' }));
  });

  it('reports a file replaced by a rename, as editors and agents save', async () => {
    const dir = tempDir();
    const target = path.join(dir, 'settings.json');
    writeFileSync(target, '{}');
    const { events } = watch(target);
    writeFileSync(path.join(dir, 'settings.json.tmp'), '{"a":1}');
    renameSync(path.join(dir, 'settings.json.tmp'), target);
    await vi.waitFor(() => expect(events).toContainEqual({ path: target, kind: 'change' }));
  });

  it('reports a file created after watching started, then deleted', async () => {
    const dir = tempDir();
    const target = path.join(dir, 'profile.json');
    const { events } = watch(target);
    writeFileSync(target, '{}');
    await vi.waitFor(() => expect(events).toContainEqual({ path: target, kind: 'change' }));
    unlinkSync(target);
    await vi.waitFor(() => expect(events.at(-1)).toEqual({ path: target, kind: 'delete' }));
  });

  it('ignores other files in the folder, and stops when unsubscribed', async () => {
    const dir = tempDir();
    const target = path.join(dir, 'settings.json');
    const sentinel = path.join(dir, 'sentinel');
    const { events, unwatch } = watch(target);
    const control = watch(sentinel);
    writeFileSync(path.join(dir, 'other.json'), '{}');
    writeFileSync(sentinel, '1');
    await vi.waitFor(() => expect(control.events.length).toBeGreaterThan(0));
    expect(events).toEqual([]);
    unwatch();
    writeFileSync(target, '{}');
    writeFileSync(sentinel, '2');
    await vi.waitFor(() => expect(control.events.length).toBeGreaterThan(1));
    expect(events).toEqual([]);
  });

  it('refuses a file whose folder does not exist', () => {
    const dir = tempDir();
    expect(() => new NodeFileWatcher().watch(path.join(dir, 'no', 'x.json'), () => {})).toThrow(FsError);
  });
});
