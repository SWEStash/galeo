import type { SandboxCause } from '../shared/contracts';
import { validateName } from './profiles/names';

const SANDBOX_CAUSES: readonly string[] = ['apparmor-userns', 'suid-helper'] satisfies SandboxCause[];
const SANDBOX_UNAVAILABLE = '--galeo-sandbox-unavailable=';
/** What the Windows `galeo.cmd` puts first, before `--` and the arguments as typed. */
export const COMMAND_MARKER = '--galeo-command';

export interface LaunchArgs {
  profile: string | null;
  newWindow: boolean;
  /** The user's per-launch sandbox opt-out; only a first launch can set it (SR-01, SR-13). */
  noSandbox: boolean;
  /** Set by the launcher wrapper's relaunch after a sandbox failure; first launch only (ADR-009). */
  sandboxUnavailable: SandboxCause | null;
  /** Absolute paths; empty means "just focus". */
  files: string[];
}

type ParseResult = { ok: true; args: LaunchArgs } | { ok: false; error: string };

interface ParseContext {
  /** Working directory of the launch that sent these arguments. */
  cwd: string;
  /** True for arguments forwarded from a later launch to the running instance. */
  forwarded: boolean;
  /** Platform path resolution, injected so core stays free of Node. */
  resolve: (cwd: string, file: string) => string;
}

function noArgs(): LaunchArgs {
  return { profile: null, newWindow: false, noSandbox: false, sandboxUnavailable: null, files: [] };
}

/** Reads `--profile NAME` or `--profile=NAME` at `argv[i]` into `args`; the index of its last argument. */
function readProfile(argv: readonly string[], i: number, args: LaunchArgs): { ok: true; last: number } | { ok: false; error: string } {
  const arg = argv[i]!;
  const last = arg === '--profile' ? i + 1 : i;
  const value = arg === '--profile' ? argv[last] : arg.slice('--profile='.length);
  if (!value || value.startsWith('-')) return { ok: false, error: '--profile needs a value' };
  if (args.profile !== null) return { ok: false, error: '--profile given twice' };
  const name = validateName(value);
  if (!name.ok) return { ok: false, error: `--profile name: ${name.reason}` };
  args.profile = value;
  return { ok: true, last };
}

const isProfile = (arg: string) => arg === '--profile' || arg.startsWith('--profile=');

/**
 * Parses galeo's own arguments strictly: the documented flags, then files. Everything after
 * `--` is a file, whatever it looks like; before `--`, files are plain names. Arguments from
 * `galeo.cmd` (all after `--`, where Chromium reads no switch) are read as `gal` reads its own.
 */
export function parseArgv(argv: readonly string[], context: ParseContext): ParseResult {
  if (argv[0] === COMMAND_MARKER && argv[1] === '--') return parseCommandArgs(argv.slice(2), context);
  const args = noArgs();
  let i = 0;
  let separated = false;
  for (; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--') {
      separated = true;
      i++;
      break;
    }
    if (!arg.startsWith('-')) break;
    if (arg === '--new-window') {
      args.newWindow = true;
    } else if (arg === '--no-sandbox') {
      args.noSandbox = !context.forwarded;
    } else if (arg.startsWith(SANDBOX_UNAVAILABLE)) {
      const cause = arg.slice(SANDBOX_UNAVAILABLE.length);
      if (!context.forwarded) {
        args.sandboxUnavailable = SANDBOX_CAUSES.includes(cause) ? (cause as SandboxCause) : 'unknown';
      }
    } else if (isProfile(arg)) {
      const read = readProfile(argv, i, args);
      if (!read.ok) return read;
      i = read.last;
    } else {
      return { ok: false, error: `unknown option: ${arg}` };
    }
  }
  const files = argv.slice(i);
  // Chromium reads switches anywhere before `--`, so at first launch one after a file name has
  // already been acted on: refuse to start rather than treat it as a file (SR-13).
  const stray = !separated && !context.forwarded ? files.find((file) => file.startsWith('-')) : undefined;
  if (stray !== undefined) return { ok: false, error: `option after a file name: ${stray} (put files after --)` };
  args.files = files.map((file) => context.resolve(context.cwd, file));
  return { ok: true, args };
}

/**
 * `gal`'s rules: galeo's flags anywhere before `--`, any other option refused (a shell that
 * expands globs may have made it from a file name), everything after `--` a file. galeo.cmd has no
 * sandbox flags: Chromium never sees them after `--`.
 */
function parseCommandArgs(argv: readonly string[], context: ParseContext): ParseResult {
  const args = noArgs();
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--') {
      files.push(...argv.slice(i + 1));
      break;
    }
    if (arg === '--new-window') {
      args.newWindow = true;
    } else if (isProfile(arg)) {
      const read = readProfile(argv, i, args);
      if (!read.ok) return read;
      i = read.last;
    } else if (arg.startsWith('-')) {
      return { ok: false, error: `unknown option: ${arg}` };
    } else {
      files.push(arg);
    }
  }
  args.files = files.map((file) => context.resolve(context.cwd, file));
  return { ok: true, args };
}
