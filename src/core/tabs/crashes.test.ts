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
    expect(crashes.crashed(1)).toEqual({ tab: 'a', reload: true });
  });

  it('blames no tab once the render finished, nor a tab of another window', () => {
    const { crashes } = recovery();
    crashes.rendering(1, 'a');
    crashes.rendering(2, 'b');
    crashes.rendered(1, 'a');
    expect(crashes.crashed(1)).toEqual({ tab: null, reload: true });
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

  it('stops bringing a window back after three crashes within a minute', () => {
    const { crashes, advance } = recovery();
    expect(crashes.crashed(1).reload).toBe(true);
    advance(20_000);
    expect(crashes.crashed(1).reload).toBe(true);
    advance(20_000);
    expect(crashes.crashed(1).reload).toBe(false);
    // Another window has its own count.
    expect(crashes.crashed(2).reload).toBe(true);
  });

  it('brings a window back again once its earlier crashes are over a minute old', () => {
    const { crashes, advance } = recovery();
    crashes.crashed(1);
    advance(30_000);
    crashes.crashed(1);
    advance(31_000);
    expect(crashes.crashed(1).reload).toBe(true);
  });

  it('forgets a closed window', () => {
    const { crashes } = recovery();
    crashes.crashed(1);
    crashes.crashed(1);
    crashes.rendering(1, 'a');
    crashes.closeWindow(1);
    expect(crashes.crashed(1)).toEqual({ tab: null, reload: true });
  });
});
