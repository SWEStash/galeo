// Packaging (ADR-008): .deb (official) and AppImage on Linux, unsigned macOS and Windows previews.
/** @type {import('electron-builder').Configuration} */
export default {
  appId: 'io.github.swestash.galeo',
  productName: 'galeo',
  directories: { output: 'release' },
  // The bundles are self-contained, so no node_modules ship.
  files: ['out/**/*', '!out/tsc/**', '!**/*.map', 'package.json', '!node_modules/**/*'],
  asar: true,
  npmRebuild: false,
  // Sets the fuses for every target, and puts the Linux binary behind its wrapper (ADR-009).
  afterPack: './packaging/after-pack.mjs',

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
        // electron-builder writes the action's group but not this key, without which no desktop shows it.
        // GNOME Shell shows its own "New Window" too unless the action's id is `new-window`.
        Actions: 'new-window;',
      },
      desktopActions: {
        'new-window': { Name: 'New Window', Exec: '/opt/galeo/galeo --new-window' },
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
