// electron-builder afterPack hook. On Linux the Electron binary moves behind the ADR-009 wrapper:
// electron-builder flips fuses on `<appOutDir>/<executableName>` after this hook runs, which by
// then is the wrapper, so the fuses are flipped here, on the real binary, before it moves.
import { FuseV1Options, FuseVersion, flipFuses } from '@electron/fuses';
import { chmod, copyFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { FUSES } from './fuses.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

export default async function afterPack({ appOutDir, electronPlatformName, packager }) {
  if (electronPlatformName !== 'linux') return;
  const executable = path.join(appOutDir, packager.executableName);
  const config = { version: FuseVersion.V1 };
  for (const [name, value] of Object.entries(FUSES)) config[FuseV1Options[name]] = value;
  await flipFuses(executable, config);

  await rename(executable, path.join(appOutDir, 'galeo-bin'));
  for (const [from, to] of [
    ['packaging/linux/galeo.sh', packager.executableName],
    ['bin/gal', 'gal'],
  ]) {
    await copyFile(path.join(ROOT, from), path.join(appOutDir, to));
    await chmod(path.join(appOutDir, to), 0o755);
  }
}
