import { describe, expect, it } from 'vitest';
import { SaveScheduler } from '../../../src/core/session/scheduler';
import { FakeClock } from '../../helpers/fakes';

function setup() {
  const clock = new FakeClock();
  const saves: number[] = [];
  const scheduler = new SaveScheduler({ clock, save: async () => void saves.push(clock.now()), quietMs: 2000, maxMs: 10_000 });
  return { clock, saves, scheduler };
}

describe('SaveScheduler (ADR-005)', () => {
  it('saves 2 s after the last change', () => {
    const { clock, saves, scheduler } = setup();
    scheduler.changed();
    clock.advance(1000);
    scheduler.changed();
    clock.advance(1999);
    expect(saves).toEqual([]);
    clock.advance(1);
    expect(saves).toEqual([3000]);
  });

  it('saves at least every 10 s while changes keep coming', () => {
    const { clock, saves, scheduler } = setup();
    for (let t = 0; t < 25_000; t += 500) {
      scheduler.changed();
      clock.advance(500);
    }
    expect(saves).toEqual([10_000, 20_000]);
  });

  it('saves nothing when nothing changed', () => {
    const { clock, saves } = setup();
    clock.advance(60_000);
    expect(saves).toEqual([]);
  });

  it('saves at once on flush (quit), and no timer fires after', async () => {
    const { clock, saves, scheduler } = setup();
    scheduler.changed();
    await scheduler.flush();
    expect(saves).toEqual([0]);
    clock.advance(20_000);
    expect(saves).toEqual([0]);
  });

  it('stops: changes after stopping are not saved', () => {
    const { clock, saves, scheduler } = setup();
    scheduler.changed();
    scheduler.stop();
    scheduler.changed();
    clock.advance(20_000);
    expect(saves).toEqual([]);
  });
});
