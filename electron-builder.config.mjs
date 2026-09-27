// Packaging (ADR-008): .deb (official) and AppImage on Linux, unsigned macOS and Windows previews.
import { builderFuses } from './packaging/fuses.mjs';

/** @type {import('electron-builder').Configuration} */
export default {
  appId: 'io.github.swestash.galeo',
  productName: 'galeo',
  directories: { output: 'release' },
  // The bundles are self-contained, so no node_modules ship.
  files: ['out/**/*', '!out/tsc/**', '!**/*.map', 'package.json', '!node_modules/**/*'],
  asar: true,
  npmRebuild: false,
  afterPack: './packaging/after-pack.mjs',
  // Linux flips its fuses in afterPack, before the binary moves behind the wrapper (ADR-009).
  ...(process.platform === 'linux' ? {} : { electronFuses: builderFuses() }),

  linux: {
    target: ['deb', 'AppImage'],
    category: 'Utility',
    maintainer: 'SWEStash <swestash.admin@gmail.com>',
    executableName: 'galeo',
    // Files always follow `--`, so no name can pass as a switch (SR-13): `Exec=… -- %F`.
    executableArgs: ['--', '%F'],
    // StartupWMClass comes from package.json's desktopName, which Electron also uses as app_id.
    syncDesktopName: true,
    mimeTypes: ['text/markdown', 'text/x-markdown', 'text/plain', 'text/x-log'],
    desktop: {
      entry: {
        Name: 'galeo',
        Comment: 'Read Markdown, text and log files',
      },
      desktopActions: {
        NewWindow: { Name: 'New Window', Exec: '/opt/galeo/galeo --new-window' },
      },
    },
  },
  deb: {
    afterInstall: 'packaging/linux/after-install.tpl',
    afterRemove: 'packaging/linux/after-remove.tpl',
    appArmorProfile: 'packaging/linux/apparmor-profile.tpl',
  },

  mac: {
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] },
    ],
    category: 'public.app-category.developer-tools',
    identity: null,
  },
  win: { target: ['nsis'] },
  nsis: { oneClick: false, perMachine: false },
  publish: null,
};
