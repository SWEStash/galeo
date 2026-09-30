import { describe, expect, it } from 'vitest';
import { asksForAttention } from './attention';

describe('asksForAttention', () => {
  it('is only for files added to a window that was already open and is not the focused one', () => {
    expect(asksForAttention({ fresh: false, files: 1, focused: false })).toBe(true);
    expect(asksForAttention({ fresh: false, files: 1, focused: true })).toBe(false);
    expect(asksForAttention({ fresh: true, files: 1, focused: false })).toBe(false);
    // No files: the window is focused instead, which the desktop turns into its own notice.
    expect(asksForAttention({ fresh: false, files: 0, focused: false })).toBe(false);
  });
});
