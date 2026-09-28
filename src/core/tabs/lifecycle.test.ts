import { describe, expect, it } from 'vitest';
import { WarmTabs } from './lifecycle';

const MB = 1024 * 1024;

function warmTabs(limits = { count: 3, bytes: 20 * MB }) {
  return new WarmTabs(limits);
}

describe('WarmTabs', () => {
  it('keeps up to three tabs warm besides the active one, demoting the least recently shown', () => {
    const warm = warmTabs();
    for (const id of ['a', 'b', 'c', 'd']) expect(warm.activated(1, id, MB)).toEqual([]);
    expect(warm.activated(1, 'e', MB)).toEqual(['a']);
    expect(warm.warm(1)).toEqual(['e', 'd', 'c', 'b']);
  });

  it('moves a tab shown again to the front, so another one is demoted', () => {
    const warm = warmTabs();
    for (const id of ['a', 'b', 'c', 'd', 'a']) warm.activated(1, id, MB);
    expect(warm.activated(1, 'e', MB)).toEqual(['b']);
  });

  it('demotes least recently shown tabs until the warm ones fit in the byte budget', () => {
    const warm = warmTabs();
    warm.activated(1, 'a', 8 * MB);
    warm.activated(1, 'b', 8 * MB);
    warm.activated(1, 'c', 8 * MB);
    expect(warm.activated(1, 'd', MB)).toEqual(['a']);
  });

  it('never demotes the active tab, however heavy it is', () => {
    const warm = warmTabs();
    warm.activated(1, 'a', MB);
    expect(warm.activated(1, 'b', 50 * MB)).toEqual([]);
    // Once it's warm, least recently shown still goes first: `a`, then `b`, which alone is over budget.
    expect(warm.activated(1, 'c', MB)).toEqual(['a', 'b']);
  });

  it('re-checks the budget when a warm tab reports a new weight', () => {
    const warm = warmTabs();
    for (const id of ['a', 'b', 'c']) warm.activated(1, id, MB);
    expect(warm.rendered(1, 'a', 30 * MB)).toEqual(['a']);
    expect(warm.rendered(1, 'c', 30 * MB)).toEqual([]);
    expect(warm.rendered(1, 'unknown', 30 * MB)).toEqual([]);
  });

  it('forgets closed tabs', () => {
    const warm = warmTabs();
    for (const id of ['a', 'b', 'c', 'd']) warm.activated(1, id, MB);
    warm.forget(1, 'b');
    expect(warm.activated(1, 'e', MB)).toEqual([]);
    expect(warm.warm(1)).toEqual(['e', 'd', 'c', 'a']);
  });

  it('under memory pressure demotes one warm tab per call, down to none, never the active one', () => {
    const warm = warmTabs();
    for (const id of ['a', 'b', 'c']) warm.activated(1, id, MB);
    expect(warm.pressure(1)).toEqual(['a']);
    expect(warm.pressure(1)).toEqual(['b']);
    expect(warm.pressure(1)).toEqual([]);
    expect(warm.warm(1)).toEqual(['c']);
  });

  it('keeps each window separate and drops a closed window', () => {
    const warm = warmTabs({ count: 1, bytes: 20 * MB });
    warm.activated(1, 'a', MB);
    warm.activated(2, 'x', MB);
    warm.activated(2, 'y', MB);
    expect(warm.activated(1, 'b', MB)).toEqual([]);
    warm.closeWindow(1);
    expect(warm.warm(1)).toEqual([]);
    expect(warm.warm(2)).toEqual(['y', 'x']);
  });
});
