import type { SandboxCause } from '../shared/contracts';
import type { LaunchArgs } from './argv';

export type StartupMode = { kind: 'normal' } | { kind: 'sandbox-unavailable'; cause: SandboxCause };

/**
 * After the launcher wrapper's relaunch (ADR-009) the app shows only the sandbox-unavailable
 * choice, and only when the process really runs without the sandbox.
 */
export function startupMode(args: LaunchArgs, { sandboxed }: { sandboxed: boolean }): StartupMode {
  if (args.sandboxUnavailable && !sandboxed) {
    return { kind: 'sandbox-unavailable', cause: args.sandboxUnavailable };
  }
  return { kind: 'normal' };
}
