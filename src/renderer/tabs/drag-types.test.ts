import { describe, expect, it } from 'vitest';
import { CARD_TYPE, fromGaleo, TAB_TYPE } from './drag-types';

describe('fromGaleo', () => {
  it('tells a tab or card drag from a drag of files', () => {
    expect(fromGaleo(new Set([TAB_TYPE]))).toBe(true);
    expect(fromGaleo(new Set([CARD_TYPE]))).toBe(true);
    expect(fromGaleo(new Set(['application/x-moz-file', 'text/uri-list']))).toBe(false);
  });
});
