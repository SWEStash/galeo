import { describe, expect, it } from 'vitest';
import { ThemeGate } from '../../../src/core/desktop/theme-gate';
import { FakeClock } from '../../helpers/fakes';

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

/** Whether `promise` has resolved by now. */
async function resolved(promise: Promise<void>): Promise<boolean> {
  let done = false;
  void promise.then(() => (done = true));
  await settle();
  return done;
}

describe('ThemeGate', () => {
  it('opens on the second theme update', async () => {
    const clock = new FakeClock();
    const gate = new ThemeGate({ clock, updates: 2, capMs: 400 });
    const opened = gate.opened();
    gate.updated();
    expect(await resolved(opened)).toBe(false);
    gate.updated();
    expect(await resolved(opened)).toBe(true);
  });

  it('opens at the cap when the desktop sends fewer updates', async () => {
    const clock = new FakeClock();
    const gate = new ThemeGate({ clock, updates: 2, capMs: 400 });
    gate.updated();
    clock.advance(399);
    expect(await resolved(gate.opened())).toBe(false);
    clock.advance(1);
    expect(await resolved(gate.opened())).toBe(true);
  });

  it('is open at once when it waits for no updates', async () => {
    const gate = new ThemeGate({ clock: new FakeClock(), updates: 0, capMs: 400 });
    expect(await resolved(gate.opened())).toBe(true);
  });
});
