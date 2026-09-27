import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../..');
const FATAL =
  '[1:0926/160000.000:FATAL:sandbox/linux/suid/client/setuid_sandbox_host.cc:166] The SUID sandbox helper binary was found, but is not configured correctly.';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function executable(file: string, body: string) {
  writeFileSync(file, body);
  chmodSync(file, 0o755);
}

/** Installs the wrapper and `gal` next to a stub `galeo-bin`, as the packaging step does. */
function install(stubBody: string): { wrapper: string; dir: string } {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'galeo-wrapper-')));
  dirs.push(dir);
  copyFileSync(path.join(ROOT, 'packaging/linux/galeo.sh'), path.join(dir, 'galeo'));
  copyFileSync(path.join(ROOT, 'bin/gal'), path.join(dir, 'gal'));
  chmodSync(path.join(dir, 'galeo'), 0o755);
  chmodSync(path.join(dir, 'gal'), 0o755);
  executable(path.join(dir, 'galeo-bin'), `#!/bin/sh\n${stubBody}\n`);
  return { wrapper: path.join(dir, 'galeo'), dir };
}

/** A PATH whose `unshare` succeeds or fails, so the AppImage check doesn't depend on the host. */
function withUnshare(dir: string, works: boolean): string {
  const bin = path.join(dir, 'fake-bin');
  mkdirSync(bin);
  executable(path.join(bin, 'unshare'), `#!/bin/sh\nexit ${works ? 0 : 1}\n`);
  return `${bin}:${process.env['PATH']}`;
}

const run = (wrapper: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync(wrapper, args, { encoding: 'utf8', cwd: path.dirname(wrapper), env: { ...process.env, ...env } });

const printArgs = `for a in "$@"; do printf '%s\\n' "$a"; done`;

/** A binary whose sandbox can't start: without --no-sandbox it aborts like Chromium does. */
const brokenSandbox = `
case " $* " in
  *" --no-sandbox "*) ${printArgs}; exit 0 ;;
esac
echo '${FATAL}' >&2
kill -TRAP $$`;

describe.skipIf(process.platform !== 'linux')('Linux launcher wrapper', () => {
  it('starts the app through gal: files after --, as absolute paths, status and stderr passed through', () => {
    const { wrapper, dir } = install(`${printArgs}; echo warn >&2; exit 3`);
    const result = run(wrapper, ['--profile', 'acme', 'a b.md']);
    expect(result.status).toBe(3);
    expect(result.stdout).toBe(`--profile\nacme\n--\n${dir}/a b.md\n`);
    expect(result.stderr).toContain('warn');
  });

  it('keeps a switch-like name after a file name as a file, so Chromium never sees it', () => {
    const { wrapper, dir } = install(printArgs);
    expect(run(wrapper, ['notes.md', '--remote-debugging-port=9222']).stdout).toBe(
      `--\n${dir}/notes.md\n${dir}/--remote-debugging-port=9222\n`,
    );
  });

  it('refuses an unknown switch without starting the app', () => {
    const { wrapper } = install('echo started');
    const result = run(wrapper, ['--renderer-cmd-prefix=evil', 'a.md']);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
  });

  it('relaunches unsandboxed into the sandbox-unavailable choice after the sandbox abort', () => {
    const { wrapper, dir } = install(brokenSandbox);
    const result = run(wrapper, ['--', 'a.md']);
    expect(result.status).toBe(0);
    const argv = result.stdout.trim().split('\n');
    expect(argv[0]).toBe('--no-sandbox');
    expect(argv[1]).toMatch(/^--galeo-sandbox-unavailable=(apparmor-userns|suid-helper)$/);
    expect(argv.slice(2)).toEqual(['--', `${dir}/a.md`]);
  });

  it('drops the --no-sandbox an AppImage adds when user namespaces are unavailable', () => {
    const { wrapper, dir } = install(brokenSandbox);
    const result = run(wrapper, ['--no-sandbox', '--', 'a.md'], { APPIMAGE: '/x.AppImage', PATH: withUnshare(dir, false) });
    expect(result.stdout.trim().split('\n')[1]).toMatch(/^--galeo-sandbox-unavailable=/);
  });

  it('keeps --no-sandbox under an AppImage when user namespaces work (the user asked for it)', () => {
    const { wrapper, dir } = install(brokenSandbox);
    const result = run(wrapper, ['--no-sandbox', '--', 'a.md'], { APPIMAGE: '/x.AppImage', PATH: withUnshare(dir, true) });
    expect(result.stdout.trim().split('\n')).toEqual(['--no-sandbox', '--', `${dir}/a.md`]);
  });

  it('does not relaunch after an abort without the sandbox message on a FATAL line', () => {
    const { wrapper } = install('echo "note: setuid_sandbox_host mentioned" >&2; kill -TRAP $$');
    const result = run(wrapper, ['--', 'a.md']);
    expect(result.status).toBe(133);
    expect(result.stdout).toBe('');
  });

  it('does not relaunch when the message appears but the process exits normally', () => {
    const { wrapper } = install(`echo '${FATAL}' >&2; exit 1`);
    const result = run(wrapper, []);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
  });

  it('only looks for the sandbox message in the startup output', () => {
    const { wrapper } = install(`i=0; while [ $i -lt 300 ]; do echo noise >&2; i=$((i+1)); done; echo '${FATAL}' >&2; kill -TRAP $$`);
    expect(run(wrapper, []).status).toBe(133);
  });

  it('passes on everything the app writes to stderr before it exits', () => {
    const { wrapper } = install('i=0; while [ $i -lt 5000 ]; do echo "line $i" >&2; i=$((i+1)); done; exit 2');
    const result = run(wrapper, []);
    expect(result.status).toBe(2);
    expect(result.stderr.trim().split('\n').at(-1)).toBe('line 4999');
  });

  it('exits with the app even when a process it started still holds stderr', () => {
    const { wrapper } = install('sleep 20 >&2 & exit 0');
    const started = Date.now();
    const result = run(wrapper, []);
    expect(result.status).toBe(0);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("forwards termination to the app and exits with the app's status", async () => {
    const { wrapper } = install(`trap 'echo stopped; exit 7' TERM; echo started; while :; do sleep 0.05; done`);
    // The app often exits while the wrapper is still in its signal trap; repeat to cover that race.
    for (let i = 0; i < 20; i++) {
      const child = spawn(wrapper, [], { stdio: ['ignore', 'pipe', 'ignore'] });
      let out = '';
      child.stdout.on('data', (chunk: Buffer) => {
        out += chunk.toString();
        if (out.includes('started')) child.kill('SIGTERM');
      });
      const status = await new Promise<number | null>((resolve) => child.once('exit', resolve));
      expect(out).toContain('stopped');
      expect(status).toBe(7);
    }
  });
});
