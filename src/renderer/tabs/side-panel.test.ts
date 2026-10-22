import { describe, expect, it } from 'vitest';
import type { TabView } from '../../shared/tabs';
import { markerOf, rowName, titleText } from './side-panel';
import type { TabStatus } from './store';

const status = (change: Partial<TabStatus>): TabStatus => ({
  state: 'ready',
  format: 'markdown',
  view: 'rendered',
  encoding: 'utf-8',
  lines: null,
  words: null,
  follow: false,
  editing: false,
  dirty: false,
  ...change,
});

const plan: TabView = { id: 'p', path: '/home/me/docs/plan.md', format: 'markdown', folder: '~/docs' };
const settings: TabView = { id: 's', path: '', kind: 'settings' };

describe('rowName', () => {
  it("is the file's name, as the folder line below tells tabs of the same name apart", () => {
    expect(rowName(plan)).toBe('plan.md');
    expect(rowName({ id: 'r', path: '/srv/acme/README.md' })).toBe('README.md');
    expect(rowName(settings)).toBe('Settings');
  });
});

describe('markerOf', () => {
  it("shows the name's first letter, a gear for Settings", () => {
    expect(markerOf(plan, undefined, false, false)).toEqual({ letter: 'P', mark: null });
    expect(markerOf({ id: 'b', path: '/home/me/.bashrc' }, undefined, false, false).letter).toBe('B');
    expect(markerOf({ id: 'n', path: '/x/42.txt' }, undefined, false, false).letter).toBe('4');
    expect(markerOf(settings, undefined, false, false).letter).toBe('⚙');
  });

  it('shows one mark: a crash or a missing file first, then unsaved changes, then following the end', () => {
    const mark = (tabStatus: TabStatus | undefined, crashed = false) => markerOf(plan, tabStatus, false, crashed).mark?.words ?? null;
    expect(mark(status({ dirty: true, editing: true, follow: true }), true)).toBe('crashed the viewer');
    expect(mark(status({ state: 'missing', dirty: true }))).toBe('file missing');
    expect(mark(status({ dirty: true, editing: true, follow: true }))).toBe('unsaved changes');
    expect(mark(status({ follow: true, editing: true }))).toBe('following the end');
    expect(mark(status({ editing: true }))).toBeNull();
    expect(markerOf(plan, undefined, true, false).mark).toBeNull();
  });
});

describe('titleText', () => {
  it("is the shown tab's name and folder, Settings for the Settings tab, and nothing in an empty window", () => {
    expect(titleText([plan, settings], 'p')).toBe('plan.md — ~/docs');
    expect(titleText([plan, settings], 's')).toBe('Settings');
    expect(titleText([{ id: 'n', path: '/notes' }], 'n')).toBe('notes');
    expect(titleText([], null)).toBe('');
  });
});
