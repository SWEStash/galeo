// The dnf repository script (ADR-036), run against tiny packages and a throwaway key. Fedora only, as root: it
// needs rpmbuild, rpmsign, createrepo_c, gpg and dnf, and its check installs galeo. CI runs it in a `fedora`
// container; elsewhere it is skipped.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(import.meta.dirname, 'dnf-repo.sh');
const TOOLS = ['rpm', 'rpmbuild', 'rpmsign', 'rpmkeys', 'createrepo_c', 'gpg', 'gpgconf', 'dnf'];
const haveTools =
  process.platform === 'linux' &&
  process.getuid?.() === 0 &&
  spawnSync('sh', ['-c', `command -v ${TOOLS.join(' ')}`], { encoding: 'utf8' }).status === 0;

let root;
let gnupg;
const env = () => ({ ...process.env, GNUPGHOME: gnupg });
const run = (...args) => spawnSync(SCRIPT, args, { encoding: 'utf8', env: env() });

/** Builds a minimal .rpm for `arch`, with the repository key inside it when `withKey`, signed by `signer` if given. */
function rpm(name, { pkg = 'galeo', arch = 'x86_64', version = '1.2.3', withKey = true, signer = gnupg } = {}) {
  const top = path.join(root, `${name}-build`);
  mkdirSync(path.join(top, 'SPECS'), { recursive: true });
  const key = withKey ? '/opt/galeo/resources/galeo-archive-keyring.asc' : '';
  writeFileSync(
    path.join(top, 'SPECS/test.spec'),
    `Name: ${pkg}\nVersion: ${version}\nRelease: 1\nSummary: test\nLicense: MIT\n%description\ntest\n` +
      `%install\nmkdir -p %{buildroot}/opt/galeo/resources\necho app > %{buildroot}/opt/galeo/resources/app.asar\n` +
      (withKey ? `echo key > %{buildroot}${key}\n` : '') +
      `%files\n/opt/galeo/resources/app.asar\n${key}\n`,
  );
  const built = spawnSync('rpmbuild', ['-bb', '--quiet', '--target', arch, '--define', `_topdir ${top}`, path.join(top, 'SPECS/test.spec')], { encoding: 'utf8' });
  expect(built.status, built.stderr).toBe(0);
  const out = path.join(root, `${name}.rpm`);
  writeFileSync(out, readFileSync(path.join(top, 'RPMS', arch, `${pkg}-${version}-1.${arch}.rpm`)));
  if (signer) {
    const signed = spawnSync('rpmsign', ['--addsign', '--define', `_gpg_path ${signer}`, '--define', '_gpg_name repo@example.invalid', out], { encoding: 'utf8' });
    expect(signed.status, signed.stderr).toBe(0);
  }
  return out;
}

/** A new ed25519 key in its own keyring, with a signing subkey like the real one; returns its armoured public key file. */
function newKey(home, name) {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  // Never a passphrase window on the developer's desktop.
  writeFileSync(path.join(home, 'gpg-agent.conf'), 'pinentry-program /bin/false\n');
  const gpg = (...args) => {
    const r = spawnSync('gpg', ['--batch', '--passphrase', '', ...args], { encoding: 'utf8', env: { ...process.env, GNUPGHOME: home } });
    expect(r.status, r.stderr).toBe(0);
    return r.stdout;
  };
  gpg('--quick-gen-key', `${name} <${name}@example.invalid>`, 'ed25519', 'cert', 'never');
  const fingerprint = gpg('--list-keys', '--with-colons').split('\n').find((line) => line.startsWith('fpr:')).split(':')[9];
  gpg('--quick-add-key', fingerprint, 'ed25519', 'sign', 'never');
  const file = path.join(root, `${name}.asc`);
  writeFileSync(file, gpg('--armor', '--export'));
  return file;
}

/** Builds and signs a repository holding `rpmFiles`. */
function signedRepo(name, ...rpmFiles) {
  const dir = path.join(root, name);
  const built = run('build', dir, ...rpmFiles);
  expect(built.status, built.stderr).toBe(0);
  const signed = run('sign', dir);
  expect(signed.status, signed.stderr).toBe(0);
  return dir;
}

describe.skipIf(!haveTools)('dnf-repo.sh', () => {
  let key;
  let good;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'galeo-dnf-'));
    gnupg = path.join(root, 'gnupg');
    key = newKey(gnupg, 'repo');
    good = rpm('good');
  });

  // Each check installs galeo and imports the key it trusts: undo both, so the next check starts clean.
  afterEach(() => {
    spawnSync('rpm', ['-e', 'galeo']);
    const keys = spawnSync('rpmkeys', ['--list'], { encoding: 'utf8' }).stdout.split('\n').map((line) => line.split(' ')[0]).filter(Boolean);
    for (const id of keys) spawnSync('rpmkeys', ['--delete', id]);
  });

  afterAll(() => {
    for (const home of [gnupg, path.join(root, 'other-gnupg')]) {
      spawnSync('gpgconf', ['--kill', 'all'], { env: { ...process.env, GNUPGHOME: home } });
    }
    rmSync(root, { recursive: true, force: true });
  });

  it('builds a signed repository that dnf installs from', () => {
    const dir = signedRepo('repo', good);
    const checked = run('check', dir, key);
    expect(checked.status, checked.stderr).toBe(0);
    expect(checked.stdout).toContain('dnf installed galeo-1.2.3-1.x86_64');
  });

  it('writes the packages and rpm-md metadata, with a detached signature on repomd.xml', () => {
    const dir = signedRepo('layout', good);
    expect(readdirSync(path.join(dir, 'packages'))).toEqual(['galeo-1.2.3-1.x86_64.rpm']);
    const repodata = readdirSync(path.join(dir, 'repodata'));
    expect(repodata).toContain('repomd.xml');
    expect(repodata).toContain('repomd.xml.asc');
    expect(repodata.some((file) => /^[0-9a-f]{64}-primary\.xml/.test(file))).toBe(true);
    expect(readFileSync(path.join(dir, 'repodata/repomd.xml.asc'), 'utf8')).toContain('BEGIN PGP SIGNATURE');
    expect(readFileSync(path.join(dir, 'repodata/repomd.xml'), 'utf8')).not.toMatch(/type="(md5|sha1?)"/);
  });

  it('fails the check when repomd.xml was changed after signing', () => {
    const dir = signedRepo('tampered', good);
    const repomd = path.join(dir, 'repodata/repomd.xml');
    writeFileSync(repomd, readFileSync(repomd, 'utf8').replace('<revision>', '<revision>9'));
    expect(run('check', dir, key).status).toBe(1);
  });

  it('fails the check against a different key', () => {
    const dir = signedRepo('other-key', good);
    const other = newKey(path.join(root, 'other-gnupg'), 'other');
    expect(run('check', dir, other).status).toBe(1);
  });

  it('fails the check of a repository that was never signed', () => {
    const dir = path.join(root, 'unsigned');
    expect(run('build', dir, good).status).toBe(0);
    expect(run('check', dir, key).status).toBe(1);
  });

  it('fails the check of an unsigned package, even in a signed repository', () => {
    const dir = signedRepo('unsigned-package', rpm('unsigned', { signer: null }));
    expect(run('check', dir, key).status).toBe(1);
  });

  it('serves x86_64 and aarch64 from one repository', () => {
    const dir = signedRepo('both', good, rpm('good-arm', { arch: 'aarch64' }));
    expect(readdirSync(path.join(dir, 'packages')).sort()).toEqual(['galeo-1.2.3-1.aarch64.rpm', 'galeo-1.2.3-1.x86_64.rpm']);
    const checked = run('check', dir, key);
    expect(checked.status, checked.stderr).toBe(0);
  });

  it('builds only galeo, for x86_64 or aarch64, one of each, one version, into a new folder', () => {
    expect(run('build', path.join(root, 'x1'), rpm('other-name', { pkg: 'notgaleo' })).stderr).toContain("'notgaleo', not galeo");
    expect(run('build', path.join(root, 'x2'), rpm('i686', { arch: 'i686' })).stderr).toContain('for i686, not x86_64 or aarch64');
    expect(run('build', path.join(root, 'x3'), good, rpm('again')).stderr).toContain('two .rpm files for x86_64');
    expect(run('build', path.join(root, 'x4'), good, rpm('newer-arm', { arch: 'aarch64', version: '1.2.4' })).stderr).toContain('1.2.4-1, not 1.2.3-1');
    expect(run('build', path.join(root, 'x5')).stderr).toContain('usage');
    mkdirSync(path.join(root, 'taken'));
    expect(run('build', path.join(root, 'taken'), good).stderr).toContain('already exists');
  });

  it('refuses to check where galeo is already installed', () => {
    const dir = signedRepo('installed', good);
    expect(run('check', dir, key).status).toBe(0);
    const again = run('check', dir, key);
    expect(again.status).toBe(1);
    expect(again.stderr).toContain('already installed');
  });

  it('tells whether the .rpm ships the repository key', () => {
    expect(run('has-key', good).status).toBe(0);
    expect(run('has-key', rpm('keyless', { withKey: false })).status).toBe(1);
  });
});
