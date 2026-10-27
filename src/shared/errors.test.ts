import { describe, expect, it } from 'vitest';
import { errorMessage } from './errors';

describe('errorMessage', () => {
  it("says an error's message, and anything else thrown as text", () => {
    expect(errorMessage(new RangeError('too deep'))).toBe('too deep');
    expect(errorMessage('stopped')).toBe('stopped');
    expect(errorMessage(42)).toBe('42');
  });
});
