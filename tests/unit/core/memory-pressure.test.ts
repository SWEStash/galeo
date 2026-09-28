import { describe, expect, it } from 'vitest';
import { MemoryPressure } from '../../../src/core/tabs/pressure';
import { FakeClock, FakeSystemMetrics } from '../../helpers/fakes';

async function tick(clock: FakeClock, ms: number) {
  clock.advance(ms);
  await new Promise((resolve) => setImmediate(resolve));
}

function setup() {
  const clock = new FakeClock();
  const metrics = new FakeSystemMetrics();
  const pressed: number[] = [];
  const pressure = new MemoryPressure({
    clock,
    metrics,
    intervalMs: 30_000,
    thresholdBytes: 500,
    onPressure: (window) => pressed.push(window),
  });
  return { clock, metrics, pressed, pressure };
}

describe('MemoryPressure', () => {
  it('samples on an interval and reports each window over the threshold', async () => {
    const { clock, metrics, pressed, pressure } = setup();
    metrics.samples.set(1, 600);
    metrics.samples.set(2, 400);
    pressure.start();
    await tick(clock, 29_999);
    expect(pressed).toEqual([]);
    await tick(clock, 1);
    expect(pressed).toEqual([1]);
    metrics.samples.set(2, 900);
    await tick(clock, 30_000);
    expect(pressed).toEqual([1, 1, 2]);
  });

  it('stops sampling', async () => {
    const { clock, metrics, pressed, pressure } = setup();
    metrics.samples.set(1, 600);
    pressure.start();
    pressure.stop();
    await tick(clock, 60_000);
    expect(pressed).toEqual([]);
  });

  it('keeps sampling after a failed sample', async () => {
    const { clock, metrics, pressed, pressure } = setup();
    metrics.failNext = true;
    metrics.samples.set(1, 600);
    pressure.start();
    await tick(clock, 30_000);
    expect(pressed).toEqual([]);
    await tick(clock, 30_000);
    expect(pressed).toEqual([1]);
  });
});
