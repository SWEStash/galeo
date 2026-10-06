import { describe, expect, it } from 'vitest';
import { CrashRecovery } from './crashes';

function recovery() {
  let now = 0;
  const crashes = new CrashRecovery(() => now);
  return { crashes, advance: (ms: number) => (now += ms) };
}

describe('CrashRecovery', () => {
  it('blames the tab the window was rendering when its renderer went away', () => {
    const { crashes } = recovery();
    crashes.rendering(1, 'a');
    expect(crashes.crashed(1)).toEqual({ tab: 'a', then: 'reload' });
  });

  it('blames no tab once the render finished, nor a tab of another window', () => {
    const { crashes } = recovery();
    crashes.rendering(1, 'a');
    crashes.rendering(2, 'b');
    crashes.rendered(1, 'a');
    expect(crashes.crashed(1)).toEqual({ tab: null, then: 'reload' });
  });

  it('keeps blaming the newest render when an older one finishes after it started', () => {
    const { crashes } = recovery();
    crashes.rendering(1, 'a');
    crashes.rendering(1, 'b');
    crashes.rendered(1, 'a');
    expect(crashes.crashed(1).tab).toBe('b');
  });

  it('forgets the blame once it was given, so a later crash is not pinned on the same tab', () => {
    const { crashes } = recovery();
    crashes.rendering(1, 'a');
    crashes.crashed(1);
    expect(crashes.crashed(1).tab).toBeNull();
  });

  it('gives up on a window after three crashes within a minute: it shows the crash loop, not its tabs', () => {
    const { crashes, advance } = recovery();
    expect(crashes.crashed(1).then).toBe('reload');
    advance(20_000);
    expect(crashes.crashed(1).then).toBe('reload');
    advance(20_000);
    expect(crashes.gaveUp(1)).toBe(false);
    expect(crashes.crashed(1).then).toBe('give-up');
    expect(crashes.gaveUp(1)).toBe(true);
    // Another window has its own count.
    expect(crashes.crashed(2).then).toBe('reload');
    expect(crashes.gaveUp(2)).toBe(false);
  });

  it('leaves a given-up window down if it crashes again, however much later', () => {
    const { crashes, advance } = recovery();
    for (let n = 0; n < 3; n++) crashes.crashed(1);
    advance(120_000);
    expect(crashes.crashed(1).then).toBe('stay-down');
  });

  it('tries a given-up window again on request, with a fresh count', () => {
    const { crashes } = recovery();
    for (let n = 0; n < 3; n++) crashes.crashed(1);
    expect(crashes.retry(1)).toBe(true);
    expect(crashes.gaveUp(1)).toBe(false);
    expect(crashes.crashed(1).then).toBe('reload');
    expect(crashes.crashed(1).then).toBe('reload');
    expect(crashes.crashed(1).then).toBe('give-up');
  });

  it('refuses a retry for a window it has not given up on', () => {
    const { crashes } = recovery();
    crashes.crashed(1);
    expect(crashes.retry(1)).toBe(false);
    expect(crashes.crashed(1).then).toBe('reload');
  });

  it('brings a window back again once its earlier crashes are over a minute old', () => {
    const { crashes, advance } = recovery();
    crashes.crashed(1);
    advance(30_000);
    crashes.crashed(1);
    advance(31_000);
    expect(crashes.crashed(1).then).toBe('reload');
  });

  it('forgets a closed window', () => {
    const { crashes } = recovery();
    crashes.crashed(1);
    crashes.crashed(1);
    crashes.crashed(1);
    crashes.rendering(1, 'a');
    crashes.closeWindow(1);
    expect(crashes.gaveUp(1)).toBe(false);
    expect(crashes.crashed(1)).toEqual({ tab: null, then: 'reload' });
  });
});
