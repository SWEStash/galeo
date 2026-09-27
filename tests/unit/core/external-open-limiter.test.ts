import { describe, expect, it } from 'vitest';
import { ExternalOpenLimiter } from '../../../src/core/links/limiter';
import { FakeClock } from '../../helpers/fakes/clock';

function setup() {
  const clock = new FakeClock(1_000_000);
  return { clock, limiter: new ExternalOpenLimiter(clock) };
}

describe('ExternalOpenLimiter (SR-04)', () => {
  it('opens a link, then refuses another from the same window within a second', () => {
    const { clock, limiter } = setup();
    expect(limiter.request(1, 'doc')).toBe('open');
    clock.advance(999);
    expect(limiter.request(1, 'doc')).toBe('refused');
    clock.advance(1);
    expect(limiter.request(1, 'doc')).toBe('open');
  });

  it('limits each window on its own', () => {
    const { limiter } = setup();
    expect(limiter.request(1, 'a')).toBe('open');
    expect(limiter.request(2, 'b')).toBe('open');
  });

  it('asks before a fourth open from one document within 10 s', () => {
    const { clock, limiter } = setup();
    for (let i = 0; i < 3; i++) {
      expect(limiter.request(1, 'doc')).toBe('open');
      clock.advance(1000);
    }
    expect(limiter.request(1, 'doc')).toBe('confirm');
  });

  it('forgets opens older than 10 s', () => {
    const { clock, limiter } = setup();
    for (let i = 0; i < 3; i++) {
      limiter.request(1, 'doc');
      clock.advance(4000);
    }
    expect(limiter.request(1, 'doc')).toBe('open');
  });

  it('counts per document, not per window', () => {
    const { clock, limiter } = setup();
    for (const doc of ['a', 'b', 'c', 'd']) {
      expect(limiter.request(1, doc)).toBe('open');
      clock.advance(1000);
    }
  });

  it('once allowed, opens that document’s links without asking again', () => {
    const { clock, limiter } = setup();
    for (let i = 0; i < 3; i++) {
      limiter.request(1, 'doc');
      clock.advance(1000);
    }
    limiter.allow(1, 'doc');
    clock.advance(1000);
    expect(limiter.request(1, 'doc')).toBe('open');
    clock.advance(1000);
    expect(limiter.request(1, 'doc')).toBe('open');
  });

  it('counts an allowed open against the per-window second', () => {
    const { limiter } = setup();
    limiter.allow(1, 'doc');
    expect(limiter.request(1, 'other')).toBe('refused');
  });

  it('once blocked, refuses that document’s links for good', () => {
    const { clock, limiter } = setup();
    limiter.block('doc');
    clock.advance(60_000);
    expect(limiter.request(1, 'doc')).toBe('refused');
    expect(limiter.request(1, 'other')).toBe('open');
  });
});
