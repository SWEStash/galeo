// The apt repository script (ADR-029), run against tiny packages and a throwaway key. Linux only: it needs
// dpkg-deb, apt-ftparchive, gpg and apt-get.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(import.meta.dirname, 'apt-repo.sh');
const TOOLS = ['dpkg-deb', 'apt-ftparchive', 'gpg', 'gpgconf', 'apt-get'];
const haveTools =
  process.platform === 'linux' &&
  // One name per `command -v`: given several, it succeeds when any one is found.
  TOOLS.every((tool) => spawnSync('sh', ['-c', `command -v ${tool}`]).status === 0);

let root;
let gnupg;
const env = () => ({ ...process.env, GNUPGHOME: gnupg });
const run = (...args) => spawnSync(SCRIPT, args, { encoding: 'utf8', env: env() });
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** Builds a minimal .deb, with the repository key inside it when `withKey`. */
function deb(name, { pkg = 'galeo', arch = 'amd64', version = '1.2.3', withKey = true } = {}) {
  const tree = path.join(root, `${name}-tree`);
  mkdirSync(path.join(tree, 'DEBIAN'), { recursive: true });
  writeFileSync(
    path.join(tree, 'DEBIAN/control'),
    `Package: ${pkg}\nVersion: ${version}\nArchitecture: ${arch}\nMaintainer: test <test@example.invalid>\nDescription: test\n`,
  );
  mkdirSync(path.join(tree, 'opt/galeo/resources'), { recursive: true });
  writeFileSync(path.join(tree, 'opt/galeo/resources/app.asar'), 'app');
  if (withKey) writeFileSync(path.join(tree, 'opt/galeo/resources/galeo-archive-keyring.asc'), 'key');
  const out = path.join(root, `${name}.deb`);
  const built = spawnSync('dpkg-deb', ['--build', '--root-owner-group', tree, out], { encoding: 'utf8' });
  expect(built.status, built.stderr).toBe(0);
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

/** Builds and signs a repository holding `debFiles`. */
function signedRepo(name, ...debFiles) {
  const dir = path.join(root, name);
  const built = run('build', dir, ...debFiles);
  expect(built.status, built.stderr).toBe(0);
  const signed = run('sign', dir);
  expect(signed.status, signed.stderr).toBe(0);
  return dir;
}

describe.skipIf(!haveTools)('apt-repo.sh', () => {
  let key;
  let good;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'galeo-apt-'));
    gnupg = path.join(root, 'gnupg');
    key = newKey(gnupg, 'repo');
    good = deb('good');
  });

  afterAll(() => {
    for (const home of [gnupg, path.join(root, 'other-gnupg')]) {
      spawnSync('gpgconf', ['--kill', 'all'], { env: { ...process.env, GNUPGHOME: home } });
    }
    rmSync(root, { recursive: true, force: true });
  });

  it('builds a signed repository that apt accepts', () => {
    const dir = signedRepo('repo', good);
    const checked = run('check', dir, key);
    expect(checked.status, checked.stderr).toBe(0);
    expect(checked.stdout).toContain('galeo_1.2.3_amd64.deb');
  });

  it('writes one suite with SHA256 only, and by-hash copies of the indexes', () => {
    const dir = signedRepo('layout', good);
    expect(readdirSync(path.join(dir, 'pool/main/g/galeo'))).toEqual(['galeo_1.2.3_amd64.deb']);
    const release = readFileSync(path.join(dir, 'dists/stable/Release'), 'utf8');
    for (const field of ['Origin: galeo', 'Suite: stable', 'Codename: stable', 'Components: main', 'Architectures: amd64', 'Acquire-By-Hash: yes']) {
      expect(release).toContain(`${field}\n`);
    }
    expect(release).not.toMatch(/^(MD5Sum|SHA1|SHA512):/m);
    expect(release).not.toMatch(/^Valid-Until:/m);
    const index = path.join(dir, 'dists/stable/main/binary-amd64');
    for (const file of ['Packages', 'Packages.gz']) {
      const data = readFileSync(path.join(index, file));
      expect(readFileSync(path.join(index, 'by-hash/SHA256', sha256(data)))).toEqual(data);
      expect(release).toContain(` ${sha256(data)} `);
    }
  });

  it('fails the check when an index was changed after signing', () => {
    const dir = signedRepo('tampered', good);
    const index = path.join(dir, 'dists/stable/main/binary-amd64');
    const packages = readFileSync(path.join(index, 'Packages'), 'utf8').replace('Version: 1.2.3', 'Version: 9.9.9');
    // The way an attacker without the key would: every index file and its by-hash copy, consistently.
    rmSync(path.join(index, 'by-hash'), { recursive: true });
    mkdirSync(path.join(index, 'by-hash/SHA256'), { recursive: true });
    for (const [file, data] of [['Packages', Buffer.from(packages)], ['Packages.gz', gzipSync(packages)]]) {
      writeFileSync(path.join(index, file), data);
      writeFileSync(path.join(index, 'by-hash/SHA256', sha256(data)), data);
    }
    const checked = run('check', dir, key);
    expect(checked.status).toBe(1);
    expect(checked.stderr).toMatch(/Hash Sum mismatch|unexpected size/);
  });

  it('fails the check against a different key', () => {
    const dir = signedRepo('other-key', good);
    const other = newKey(path.join(root, 'other-gnupg'), 'other');
    const checked = run('check', dir, other);
    expect(checked.status).toBe(1);
    expect(checked.stderr).toMatch(/NO_PUBKEY|not signed/);
  });

  it('fails the check of a repository that was never signed', () => {
    const dir = path.join(root, 'unsigned');
    expect(run('build', dir, good).status).toBe(0);
    expect(run('check', dir, key).status).toBe(1);
  });

  it('serves amd64 and arm64 from one signed Release, and apt accepts each', () => {
    const dir = signedRepo('both', good, deb('good-arm', { arch: 'arm64' }));
    expect(readdirSync(path.join(dir, 'pool/main/g/galeo')).sort()).toEqual(['galeo_1.2.3_amd64.deb', 'galeo_1.2.3_arm64.deb']);
    expect(readFileSync(path.join(dir, 'dists/stable/Release'), 'utf8')).toContain('Architectures: amd64 arm64\n');
    for (const arch of ['amd64', 'arm64']) {
      const packages = readFileSync(path.join(dir, `dists/stable/main/binary-${arch}/Packages`), 'utf8');
      expect(packages.match(/^Architecture: .*$/gm)).toEqual([`Architecture: ${arch}`]);
    }
    const checked = run('check', dir, key);
    expect(checked.status, checked.stderr).toBe(0);
    expect(checked.stdout).toContain('galeo_1.2.3_amd64.deb');
    expect(checked.stdout).toContain('galeo_1.2.3_arm64.deb');
  });

  it('builds only galeo, for amd64 or arm64, one of each, one version, into a new folder', () => {
    expect(run('build', path.join(root, 'x1'), deb('other-name', { pkg: 'notgaleo' })).stderr).toContain("'notgaleo', not galeo");
    expect(run('build', path.join(root, 'x2'), deb('armhf', { arch: 'armhf' })).stderr).toContain('for armhf, not amd64 or arm64');
    expect(run('build', path.join(root, 'x3'), good, deb('again')).stderr).toContain('two .deb files for amd64');
    expect(run('build', path.join(root, 'x4'), good, deb('newer-arm', { arch: 'arm64', version: '1.2.4' })).stderr).toContain('1.2.4, not 1.2.3');
    expect(run('build', path.join(root, 'x5')).stderr).toContain('usage');
    mkdirSync(path.join(root, 'taken'));
    expect(run('build', path.join(root, 'taken'), good).stderr).toContain('already exists');
  });

  it('tells whether the .deb ships the repository key', () => {
    expect(run('has-key', good).status).toBe(0);
    expect(run('has-key', deb('keyless', { withKey: false })).status).toBe(1);
  });
});
