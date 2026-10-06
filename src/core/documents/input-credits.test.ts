import { describe, expect, it } from 'vitest';
import { InputCredits } from './input-credits';

function credits() {
  let now = 0;
  const input = new InputCredits(() => now);
  return { input, advance: (ms: number) => (now += ms) };
}

describe('InputCredits', () => {
  it('lets a window spend one credit per real input, and none without', () => {
    const { input } = credits();
    expect(input.spend(1)).toBe(false);
    input.received(1);
    expect(input.spend(1)).toBe(true);
    expect(input.spend(1)).toBe(false);
  });

  it("keeps each window's credits apart", () => {
    const { input } = credits();
    input.received(1);
    expect(input.spend(2)).toBe(false);
    expect(input.spend(1)).toBe(true);
  });

  it('lets credits lapse a second after their input', () => {
    const { input, advance } = credits();
    input.received(1);
    advance(999);
    input.received(1);
    advance(1);
    expect(input.spend(1)).toBe(true);
    expect(input.spend(1)).toBe(false);
  });

  it('holds at most five credits, however fast the input', () => {
    const { input } = credits();
    for (let n = 0; n < 20; n++) input.received(1);
    const spent = Array.from({ length: 20 }, () => input.spend(1)).filter(Boolean);
    expect(spent).toHaveLength(5);
  });

  it('forgets a closed window', () => {
    const { input } = credits();
    input.received(1);
    input.closeWindow(1);
    expect(input.spend(1)).toBe(false);
  });
});
