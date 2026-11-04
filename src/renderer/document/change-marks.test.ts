import { describe, expect, it } from 'vitest';
import { createBaselines } from './change-marks';

describe('createBaselines', () => {
  it('takes the first text a tab shows as its baseline, and keeps it while the tab is looked at', () => {
    const baselines = createBaselines();
    expect(baselines.get('t', '/a.md')).toBeNull();
    baselines.ensure('t', '/a.md', 'first');
    baselines.ensure('t', '/a.md', 'second');
    expect(baselines.get('t', '/a.md')).toBe('first');
  });

  it('takes a new baseline on reset: leaving the tab, clearing, saving, ending edit mode', () => {
    const baselines = createBaselines();
    baselines.ensure('t', '/a.md', 'first');
    baselines.reset('t', '/a.md', 'left at this');
    expect(baselines.get('t', '/a.md')).toBe('left at this');
  });

  it('starts again when the tab shows another file', () => {
    const baselines = createBaselines();
    baselines.ensure('t', '/a.md', 'a');
    expect(baselines.get('t', '/b.md')).toBeNull();
    baselines.ensure('t', '/b.md', 'b');
    expect(baselines.get('t', '/b.md')).toBe('b');
    expect(baselines.get('t', '/a.md')).toBeNull();
  });

  it('keeps no baseline for a document over the cap', () => {
    const baselines = createBaselines({ maxDocChars: 5, maxTotalChars: 100 });
    baselines.ensure('t', '/a.md', 'small');
    baselines.reset('t', '/a.md', 'too long');
    expect(baselines.get('t', '/a.md')).toBeNull();
    expect(baselines.tooLarge('too long')).toBe(true);
    expect(baselines.tooLarge('small')).toBe(false);
  });

  it('drops the baselines set longest ago once all of them pass the total cap, never the newest', () => {
    const baselines = createBaselines({ maxDocChars: 10, maxTotalChars: 10 });
    baselines.ensure('a', '/a', '1234');
    baselines.ensure('b', '/b', '1234');
    baselines.reset('a', '/a', '1234');
    baselines.ensure('c', '/c', '1234');
    expect(baselines.get('b', '/b')).toBeNull();
    expect(baselines.get('a', '/a')).toBe('1234');
    expect(baselines.get('c', '/c')).toBe('1234');
  });

  it('keeps only the tabs still open', () => {
    const baselines = createBaselines();
    baselines.ensure('a', '/a', 'x');
    baselines.ensure('b', '/b', 'y');
    baselines.retain(new Set(['b']));
    expect(baselines.get('a', '/a')).toBeNull();
    expect(baselines.get('b', '/b')).toBe('y');
  });

  it('forgets a tab', () => {
    const baselines = createBaselines();
    baselines.ensure('t', '/a.md', 'x');
    baselines.forget('t');
    expect(baselines.get('t', '/a.md')).toBeNull();
  });
});
