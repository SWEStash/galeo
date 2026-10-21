import { describe, expect, it, vi } from 'vitest';
import { keepCaretKeys } from './overlay-keys';

const key = (key: string, shiftKey = false) => ({ key, shiftKey, stopPropagation: vi.fn() });

describe('keepCaretKeys', () => {
  it('keeps Home and End in the field, with or without Shift', () => {
    for (const event of [key('Home'), key('End'), key('Home', true), key('End', true)]) {
      expect(keepCaretKeys(event)).toBe(true);
      expect(event.stopPropagation).toHaveBeenCalled();
    }
  });

  it('lets the keys that move through the list pass', () => {
    for (const event of [key('ArrowDown'), key('ArrowUp'), key('PageDown'), key('PageUp'), key('Enter'), key('a')]) {
      expect(keepCaretKeys(event)).toBe(false);
      expect(event.stopPropagation).not.toHaveBeenCalled();
    }
  });
});
