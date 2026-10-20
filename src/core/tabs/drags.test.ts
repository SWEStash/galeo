import { describe, expect, it } from 'vitest';
import { DRAG_MS, TabDrags } from './drags';

describe('TabDrags (ADR-019, ADR-022)', () => {
  it("claims by the drag's token only: a tab's id claims nothing", () => {
    const drags = new TabDrags();
    drags.start('t1', 'k-t1', 1, 0);
    expect(drags.claim('t1', 0)).toBeNull();
    expect(drags.claim('k-t1', 0)).toEqual({ id: 't1', window: 1 });
  });

  it('never takes a token twice', () => {
    const drags = new TabDrags();
    expect(drags.start('t1', 'k-1', 1, 0)).toBe(true);
    drags.claim('k-1', 0);
    expect(drags.start('t1', 'k-1', 1, 0)).toBe(false);
    expect(drags.dragging(0)).toBe(false);
    expect(drags.start('t1', 'k-2', 1, 0)).toBe(true);
  });

  it('hands the dragged tab to one claim only, saying which window it came from', () => {
    const drags = new TabDrags();
    drags.start('t1', 'k-t1', 1, 0);
    expect(drags.claim('k-t1', 10)).toEqual({ id: 't1', window: 1 });
    expect(drags.claim('k-t1', 20)).toBeNull();
  });

  it('refuses a tab nobody is dragging', () => {
    const drags = new TabDrags();
    expect(drags.claim('k-t1', 0)).toBeNull();
    drags.start('t1', 'k-t1', 1, 0);
    expect(drags.claim('k-t2', 0)).toBeNull();
    expect(drags.claim('k-t1', 0)).toEqual({ id: 't1', window: 1 });
  });

  it('hands the drag to its own window only when asked to, leaving it for the drop otherwise', () => {
    const drags = new TabDrags();
    drags.start('t1', 'k-t1', 1, 0);
    expect(drags.claim('k-t1', 0, 2)).toBeNull();
    expect(drags.claim('k-t1', 0, 1)).toEqual({ id: 't1', window: 1 });
    expect(drags.claim('k-t1', 0)).toBeNull();
  });

  it('keeps only the latest drag', () => {
    const drags = new TabDrags();
    drags.start('t1', 'k-t1', 1, 0);
    drags.start('t2', 'k-t2', 2, 5);
    expect(drags.claim('k-t1', 6)).toBeNull();
    expect(drags.claim('k-t2', 6)).toEqual({ id: 't2', window: 2 });
  });

  it('lets a drag lapse after its time', () => {
    const drags = new TabDrags();
    drags.start('t1', 'k-1', 1, 0);
    expect(drags.claim('k-1', DRAG_MS)).toBeNull();
    drags.start('t1', 'k-2', 1, 0);
    expect(drags.claim('k-2', DRAG_MS - 1)).toEqual({ id: 't1', window: 1 });
  });

  it('ends a drag only for the window that started it, and says whether one was going', () => {
    const drags = new TabDrags();
    drags.start('t1', 'k-t1', 1, 0);
    expect(drags.end(2)).toBe(false);
    expect(drags.dragging(0)).toBe(true);
    expect(drags.end(1)).toBe(true);
    expect(drags.dragging(0)).toBe(false);
    expect(drags.claim('k-t1', 0)).toBeNull();
    expect(drags.end(1)).toBe(false);
  });

  it('is not dragging once the drag lapsed or was claimed', () => {
    const drags = new TabDrags();
    drags.start('t1', 'k-1', 1, 0);
    expect(drags.dragging(DRAG_MS)).toBe(false);
    drags.start('t1', 'k-2', 1, 0);
    drags.claim('k-2', 1);
    expect(drags.dragging(1)).toBe(false);
  });

  it('keeps a drag claimable after its window says it ended, until it is settled', () => {
    const drags = new TabDrags();
    drags.start('t1', 'k-t1', 1, 0);
    expect(drags.pending('t1', 2)).toBeNull();
    expect(drags.pending('t2', 1)).toBeNull();
    const ended = drags.pending('t1', 1)!;
    expect(drags.claim('k-t1', 0)).toEqual({ id: 't1', window: 1 });
    expect(drags.settle(ended)).toBe(false);
  });

  it('settles a drag once, and never a later one that took its place', () => {
    const drags = new TabDrags();
    drags.start('t1', 'k-1', 1, 0);
    const ended = drags.pending('t1', 1)!;
    expect(drags.settle(ended)).toBe(true);
    expect(drags.dragging(0)).toBe(false);
    expect(drags.settle(ended)).toBe(false);
    drags.start('t1', 'k-2', 1, 0);
    const first = drags.pending('t1', 1)!;
    drags.start('t1', 'k-3', 1, 5);
    expect(drags.settle(first)).toBe(false);
    expect(drags.claim('k-3', 6)).toEqual({ id: 't1', window: 1 });
  });
});
