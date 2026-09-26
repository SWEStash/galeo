import { describe, expect, it } from 'vitest';
import type { LaunchArgs } from './argv';
import { startupMode } from './startup';

const args = (overrides: Partial<LaunchArgs> = {}): LaunchArgs => ({
  profile: null,
  newWindow: false,
  noSandbox: false,
  sandboxUnavailable: null,
  files: [],
  ...overrides,
});

describe('startupMode', () => {
  it('starts normally by default', () => {
    expect(startupMode(args(), { sandboxed: true })).toEqual({ kind: 'normal' });
  });

  it('shows only the sandbox-unavailable choice after the wrapper relaunch', () => {
    const relaunch = args({ noSandbox: true, sandboxUnavailable: 'apparmor-userns' });
    expect(startupMode(relaunch, { sandboxed: false })).toEqual({
      kind: 'sandbox-unavailable',
      cause: 'apparmor-userns',
    });
  });

  it('ignores the wrapper flag when the process is actually sandboxed', () => {
    const flagOnly = args({ sandboxUnavailable: 'suid-helper' });
    expect(startupMode(flagOnly, { sandboxed: true })).toEqual({ kind: 'normal' });
  });
});
