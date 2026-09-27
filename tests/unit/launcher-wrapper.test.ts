import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const WRAPPER = path.resolve(import.meta.dirname, '../../packaging/linux/galeo.sh');
const FATAL =
  '[1:0926/160000.000:FATAL:sandbox/linux/suid/client/setuid_sandbox_host.cc:166] The SUID sandbox helper binary was found, but is not configured correctly.';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Installs the wrapper next to a stub `galeo-bin` with the given shell body. */
function install(stubBody: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'galeo-wrapper-'));
  dirs.push(dir);
  copyFileSync(WRAPPER, path.join(dir, 'galeo'));
  chmodSync(path.join(dir, 'galeo'), 0o755);
  writeFileSync(path.join(dir, 'galeo-bin'), `#!/bin/sh\n${stubBody}\n`);
  chmodSync(path.join(dir, 'galeo-bin'), 0o755);
  return path.join(dir, 'galeo');
}

const run = (wrapper: string, ...args: string[]) => spawnSync(wrapper, args, { encoding: 'utf8' });

/** A binary whose sandbox can't start: without --no-sandbox it aborts like Chromium does. */
const brokenSandbox = `
case " $* " in
  *" --no-sandbox "*) for a in "$@"; do printf '%s\\n' "$a"; done; exit 0 ;;
esac
echo '${FATAL}' >&2
kill -TRAP $$`;

describe.skipIf(process.platform !== 'linux')('Linux launcher wrapper', () => {
  it('runs the binary with the arguments unchanged and passes its status and stderr through', () => {
    const wrapper = install(`for a in "$@"; do printf '%s\\n' "$a"; done; echo warn >&2; exit 3`);
    const result = run(wrapper, '--profile', 'acme', '--', 'a b.md');
    expect(result.status).toBe(3);
    expect(result.stdout).toBe('--profile\nacme\n--\na b.md\n');
    expect(result.stderr).toContain('warn');
  });

  it('relaunches unsandboxed into the sandbox-unavailable choice after the sandbox abort', () => {
    const result = run(install(brokenSandbox), '--', 'a.md');
    expect(result.status).toBe(0);
    const argv = result.stdout.trim().split('\n');
    expect(argv[0]).toBe('--no-sandbox');
    expect(argv[1]).toMatch(/^--galeo-sandbox-unavailable=(apparmor-userns|suid-helper)$/);
    expect(argv.slice(2)).toEqual(['--', 'a.md']);
  });

  it('does not relaunch after an abort without the sandbox message', () => {
    const result = run(install('echo "something else" >&2; kill -TRAP $$'), '--', 'a.md');
    expect(result.status).toBe(133);
    expect(result.stdout).toBe('');
  });

  it('does not relaunch when the message appears but the process exits normally', () => {
    const result = run(install(`echo '${FATAL}' >&2; exit 1`));
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
  });

  it('forwards termination to the app', async () => {
    const wrapper = install(`trap 'echo stopped; exit 0' TERM; echo started; while :; do sleep 0.05; done`);
    const child = spawn(wrapper, [], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString();
      if (out.includes('started')) child.kill('SIGTERM');
    });
    const status = await new Promise<number | null>((resolve) => child.once('exit', resolve));
    expect(out).toContain('stopped');
    expect(status).toBe(0);
  });
});
