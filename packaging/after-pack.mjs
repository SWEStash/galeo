// electron-builder afterPack hook: sets the fuses (SR-08) for the target platform, then on Linux
// moves the Electron binary behind the ADR-009 wrapper. Fuses are flipped here rather than
// through the `electronFuses` option because electron-builder flips `<executableName>` after
// this hook, which on Linux is then the wrapper.
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { chmod, copyFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { FUSES } from './fuses.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

export default async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  // Flipping fuses breaks the ad-hoc signature of the unsigned macOS previews; renew it.
  const config = { version: FuseVersion.V1, resetAdHocDarwinSignature: electronPlatformName === 'darwin' };
  for (const [name, value] of Object.entries(FUSES)) config[FuseV1Options[name]] = value;
  await packager.addElectronFuses(context, config);

  if (electronPlatformName !== 'linux') return;
  await rename(path.join(appOutDir, packager.executableName), path.join(appOutDir, 'galeo-bin'));
  for (const [from, to] of [
    ['packaging/linux/galeo.sh', packager.executableName],
    ['bin/gal', 'gal'],
  ]) {
    await copyFile(path.join(ROOT, from), path.join(appOutDir, to));
    await chmod(path.join(appOutDir, to), 0o755);
  }
}
