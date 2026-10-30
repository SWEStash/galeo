// Verifies a packaged build in release/ (SR-08): the fuses read back from the binary match
// packaging/fuses.mjs, the check notices a flipped fuse, and the packaged app starts and parses
// its arguments. Playwright can't drive the packaged app: its fuses refuse --inspect.
import { FuseV1Options, FuseVersion, flipFuses, getCurrentFuseWire } from '@electron/fuses';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FUSES } from '../packaging/fuses.mjs';
import { ASSOCIATED_EXTENSIONS, macDocumentTypeProblems, regValue, WINDOWS_PROG_ID } from './lib/associations.mjs';
import { desktopEntryProblems } from './lib/desktop-entry.mjs';
import { fuseMismatches } from './lib/fuses.mjs';

const RELEASE = path.resolve(import.meta.dirname, '../release');

/** The binary that carries the fuses, the entry point a user starts, and the resources folder. */
function packagedApp() {
  if (process.platform === 'linux') {
    const dir = path.join(RELEASE, 'linux-unpacked');
    return { fuses: path.join(dir, 'galeo-bin'), entry: path.join(dir, 'galeo'), resources: path.join(dir, 'resources') };
  }
  if (process.platform === 'darwin') {
    // The build for this machine's architecture (electron-builder: `mac` is x64, `mac-arm64`
    // arm64), so the arm64 app's renewed ad-hoc signature is exercised on arm64 runners.
    const dir = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
    if (!readdirSync(RELEASE).includes(dir)) throw new Error(`no ${dir} build in release/`);
    const app = path.join(RELEASE, dir, 'galeo.app');
    return {
      fuses: app,
      entry: path.join(app, 'Contents', 'MacOS', 'galeo'),
      resources: path.join(app, 'Contents', 'Resources'),
    };
  }
  const dir = path.join(RELEASE, process.arch === 'arm64' ? 'win-arm64-unpacked' : 'win-unpacked');
  return { fuses: path.join(dir, 'galeo.exe'), entry: path.join(dir, 'galeo.exe'), resources: path.join(dir, 'resources') };
}

const failures = [];
const { fuses, entry, resources } = packagedApp();

// A release bundle must not carry the performance harness hooks (builds made with GALEO_PERF=1).
const asar = readFileSync(path.join(resources, 'app.asar'));
if (asar.includes('GALEO_PERF_OUT')) {
  failures.push('bundle: built with GALEO_PERF=1 (perf hooks present); rebuild without it');
} else {
  console.log('bundle: no perf hooks');
}

// The About dialog's notices (docs/dependencies.md "Licence notices to ship"): the packages' terms
// and the fonts' OFL in the bundle, Chromium's and Electron's licences beside the app (Linux and
// Windows; the macOS preview's app bundle keeps them elsewhere).
const besideApp = process.platform === 'darwin' ? [] : ['LICENSES.chromium.html', 'LICENSE.electron.txt'];
const missingNotices = [
  ...['react-aria-components', 'Apache License', 'SIL OPEN FONT LICENSE'].filter((text) => !asar.includes(text)).map((text) => `"${text}" not in the bundle`),
  ...besideApp.filter((file) => !existsSync(path.join(resources, '..', file))).map((file) => `${file} not packaged`),
];
if (missingNotices.length) failures.push(...missingNotices.map((problem) => `notices: ${problem}`));
else console.log('notices: packages, fonts, Chromium and Electron licences');

// The .deb's AppArmor profile must grant user namespaces to the Electron binary itself, not to
// the wrapper in front of it (ADR-009).
if (process.platform === 'linux') {
  let profile = '';
  try {
    profile = readFileSync(path.join(resources, 'apparmor-profile'), 'utf8');
  } catch {
    failures.push('apparmor: no profile in the package (is the deb target built?)');
  }
  if (profile.includes('"/opt/galeo/galeo-bin"')) console.log('apparmor: profile names galeo-bin');
  else if (profile) failures.push('apparmor: the profile does not name /opt/galeo/galeo-bin');
}

// The .deb's desktop entry: files after `--`, the MIME types, the window class, the New Window action.
if (process.platform === 'linux') {
  // The newest .deb: release/ can still hold older builds.
  const deb = readdirSync(RELEASE)
    .filter((name) => name.endsWith('.deb'))
    .sort((a, b) => statSync(path.join(RELEASE, b)).mtimeMs - statSync(path.join(RELEASE, a)).mtimeMs)[0];
  if (!deb) failures.push('desktop entry: no .deb in release/ (is the deb target built?)');
  else {
    const extracted = spawnSync('sh', ['-c', `dpkg-deb --fsys-tarfile "$1" | tar -xO ./usr/share/applications/galeo.desktop`, 'sh', path.join(RELEASE, deb)], { encoding: 'utf8' });
    const problems = extracted.status === 0 ? desktopEntryProblems(extracted.stdout) : [`not readable (${extracted.stderr.trim()})`];
    if (problems.length) failures.push(...problems.map((problem) => `desktop entry: ${problem}`));
    else console.log('desktop entry: files after --, MIME types, window class, icon, New Window');

    // galeo's own icon, not electron-builder's default: in the hicolor theme, and the one the
    // window and the AppImage launcher use.
    const icon = readFileSync(path.resolve(import.meta.dirname, '../packaging/icons/png/256x256.png'));
    const themed = spawnSync('sh', ['-c', `dpkg-deb --fsys-tarfile "$1" | tar -xO ./usr/share/icons/hicolor/256x256/apps/galeo.png`, 'sh', path.join(RELEASE, deb)]);
    let resourceIcon = null;
    try {
      resourceIcon = readFileSync(path.join(resources, 'icon.png'));
    } catch {
      // Reported below.
    }
    if (themed.status !== 0 || !icon.equals(themed.stdout)) failures.push("icon: the .deb's 256x256 hicolor icon is not packaging/icons/png/256x256.png");
    else if (!resourceIcon?.equals(icon)) failures.push('icon: resources/icon.png is not packaging/icons/png/256x256.png');
    else console.log("icon: galeo's own, in the hicolor theme and in resources");

    // The MDX type: in resources (the AppImage launcher reads it there), copied in by postinst, removed by postrm.
    const mime = readFileSync(path.resolve(import.meta.dirname, '../packaging/linux/galeo-mime.xml'));
    let resourceMime = null;
    try {
      resourceMime = readFileSync(path.join(resources, 'mime.xml'));
    } catch {
      // Reported below.
    }
    const script = (name) => spawnSync('sh', ['-c', `dpkg-deb --ctrl-tarfile "$1" | tar -xO ./${name}`, 'sh', path.join(RELEASE, deb)], { encoding: 'utf8' }).stdout;
    const target = '/usr/share/mime/packages/galeo.xml';
    if (!resourceMime?.equals(mime)) failures.push('mime: resources/mime.xml is not packaging/linux/galeo-mime.xml');
    else if (!script('postinst').includes(`cp -f '/opt/galeo/resources/mime.xml' '${target}'`)) failures.push(`mime: postinst doesn't copy it to ${target}`);
    else if (!script('postrm').includes(`rm -f '${target}'`)) failures.push(`mime: postrm doesn't remove ${target}`);
    else console.log('mime: the MDX type in resources, installed and removed by the .deb');
  }
}

// macOS "Open With": the document types galeo views, never as their default app.
if (process.platform === 'darwin') {
  const plist = spawnSync('plutil', ['-convert', 'json', '-o', '-', path.join(fuses, 'Contents', 'Info.plist')], { encoding: 'utf8' });
  const problems = plist.status === 0 ? macDocumentTypeProblems(JSON.parse(plist.stdout)) : [`Info.plist not readable (${plist.stderr.trim()})`];
  if (problems.length) failures.push(...problems.map((problem) => `associations: ${problem}`));
  else console.log(`associations: ${ASSOCIATED_EXTENSIONS.length} extensions, as a viewer, never the default`);
}

// Windows: the installer and the portable build for this architecture; on CI, the installer's
// "Open with" entries, read back from the registry after a silent per-user install and gone after
// the uninstall. Elsewhere that part is skipped: it would install galeo for whoever runs the check.
if (process.platform === 'win32') {
  const { version } = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../package.json'), 'utf8'));
  const setup = path.join(RELEASE, `galeo-${version}-${process.arch}-setup.exe`);
  const portable = path.join(RELEASE, `galeo-${version}-${process.arch}-portable.exe`);
  const missing = [setup, portable].filter((file) => !existsSync(file));
  if (missing.length) failures.push(...missing.map((file) => `windows: no ${path.basename(file)} in release/`));
  else console.log(`windows: ${path.basename(setup)} and ${path.basename(portable)}`);
  if (!missing.includes(setup)) {
    if (process.env.CI) failures.push(...windowsAssociationProblems(setup).map((problem) => `associations: ${problem}`));
    else console.log('associations: skipped outside CI (the check installs galeo for this user)');
  }
}

/** Installs galeo silently for this user, checks its "Open with" entries, uninstalls it and checks they're gone. */
function windowsAssociationProblems(setup) {
  const classes = 'HKCU\\Software\\Classes';
  const query = (key, ...args) => spawnSync('reg', ['query', key, ...args], { encoding: 'utf8' });
  const listed = (ext) => regValue(query(`${classes}\\.${ext}\\OpenWithProgids`).stdout, WINDOWS_PROG_ID) !== null;
  const problems = [];
  const install = spawnSync(setup, ['/S'], { timeout: 180_000 });
  if (install.status !== 0) return [`the silent install failed (${install.status ?? install.error?.message})`];
  const command = regValue(query(`${classes}\\${WINDOWS_PROG_ID}\\shell\\open\\command`, '/ve').stdout, '(Default)');
  const exe = /^"([^"]+\\galeo\.exe)" -- "%1"$/.exec(command ?? '')?.[1];
  if (!exe) problems.push(`${WINDOWS_PROG_ID} must open "<galeo.exe>" -- "%1", got ${command}`);
  for (const ext of ASSOCIATED_EXTENSIONS) {
    if (!listed(ext)) problems.push(`.${ext} doesn't list ${WINDOWS_PROG_ID} in OpenWithProgids`);
    if (regValue(query(`${classes}\\.${ext}`, '/ve').stdout, '(Default)') === WINDOWS_PROG_ID) problems.push(`galeo is the default app for .${ext}`);
  }
  if (!problems.length) console.log(`associations: ${ASSOCIATED_EXTENSIONS.length} extensions in "Open with", files after --, never the default`);
  if (!exe) return problems;
  // The uninstaller hands over to a copy of itself and returns at once: wait for the entries to go.
  spawnSync(path.win32.join(path.win32.dirname(exe), 'Uninstall galeo.exe'), ['/S'], { timeout: 180_000 });
  const deadline = Date.now() + 120_000;
  while (query(`${classes}\\${WINDOWS_PROG_ID}`).status === 0 && Date.now() < deadline) spawnSync('ping', ['-n', '2', '127.0.0.1']);
  const left = [query(`${classes}\\${WINDOWS_PROG_ID}`).status === 0 && WINDOWS_PROG_ID, ...ASSOCIATED_EXTENSIONS.filter(listed).map((ext) => `.${ext}`)].filter(Boolean);
  if (left.length) problems.push(`the uninstall left ${left.join(', ')}`);
  else console.log('associations: the uninstall removed them');
  return problems;
}

const mismatches = fuseMismatches(await getCurrentFuseWire(fuses), FUSES);
if (mismatches.length) failures.push(...mismatches.map((m) => `fuses: ${m}`));
else console.log(`fuses: all ${Object.keys(FUSES).length} as expected in ${path.relative(RELEASE, fuses)}`);

// The check must notice a flipped fuse, on a copy of the binary.
const scratch = mkdtempSync(path.join(tmpdir(), 'galeo-fuses-'));
try {
  const copy = path.join(scratch, path.basename(fuses));
  cpSync(fuses, copy, { recursive: true, verbatimSymlinks: true });
  await flipFuses(copy, { version: FuseVersion.V1, [FuseV1Options.RunAsNode]: true });
  const flipped = fuseMismatches(await getCurrentFuseWire(copy), FUSES);
  if (flipped.includes('RunAsNode is enabled, expected disabled')) console.log('fuses: a flipped fuse is detected');
  else failures.push(`fuses: flipping RunAsNode went unnoticed (${JSON.stringify(flipped)})`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

// Smoke test: the packaged app runs its own code (from the asar). The arguments pass the Linux
// launcher's checks but not the app's, so the app itself must answer.
const home = mkdtempSync(path.join(tmpdir(), 'galeo-smoke-'));
try {
  const result = spawnSync(entry, ['--profile', 'a', '--profile', 'b'], {
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      XDG_CONFIG_HOME: path.join(home, 'config'),
      XDG_STATE_HOME: path.join(home, 'state'),
      XDG_CACHE_HOME: path.join(home, 'cache'),
    },
  });
  if (result.status === 2 && result.stderr.includes('galeo: --profile given twice')) {
    const relaunched = result.stderr.includes('setuid_sandbox_host');
    console.log(`smoke: the packaged app parsed its arguments${relaunched ? ' (after the sandbox-unavailable relaunch)' : ''}`);
  } else {
    failures.push(`smoke: expected exit 2 and "--profile given twice", got ${result.status}: ${result.stderr.slice(-500)}`);
  }
} finally {
  rmSync(home, { recursive: true, force: true });
}

if (failures.length) {
  for (const failure of failures) console.error(`✗ ${failure}`);
  process.exit(1);
}
