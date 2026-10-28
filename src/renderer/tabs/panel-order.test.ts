import { describe, expect, it } from 'vitest';
import { panelOrder } from './panel-order';

describe('panelOrder', () => {
  it('starts in tab order', () => {
    expect(panelOrder([], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('keeps the panels where they were when the tabs are reordered', () => {
    expect(panelOrder(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['a', 'b', 'c']);
  });

  it('adds new tabs at the end and drops closed ones', () => {
    expect(panelOrder(['a', 'b', 'c'], ['d', 'c', 'a'])).toEqual(['a', 'c', 'd']);
  });
});
