// Packaging (ADR-008): .deb (official) and AppImage on Linux, unsigned macOS and Windows previews.
import { MAC_FILE_ASSOCIATIONS } from './scripts/lib/associations.mjs';
import { MIME_TYPES } from './scripts/lib/desktop-entry.mjs';

/** @type {import('electron-builder').Configuration} */
export default {
  appId: 'io.github.swestash.galeo',
  productName: 'galeo',
  directories: { output: 'release' },
  // The bundles are self-contained, so no node_modules ship.
  files: ['out/**/*', '!out/tsc/**', '!out/bundle/**', '!**/*.map', 'package.json', '!node_modules/**/*'],
  asar: true,
  npmRebuild: false,
  // Sets the fuses for every target, and puts the Linux binary behind its wrapper (ADR-009).
  afterPack: './packaging/after-pack.mjs',

  linux: {
    target: ['deb', 'AppImage'],
    // The hicolor sizes, named <size>x<size>.png; the window and the AppImage launcher use resources/icon.png.
    icon: 'packaging/icons/png',
    // The MDX type: the .deb's after-install copies it into /usr/share/mime, the AppImage launcher into ~/.local.
    extraResources: [
      { from: 'packaging/icons/png/256x256.png', to: 'icon.png' },
      { from: 'packaging/linux/galeo-mime.xml', to: 'mime.xml' },
    ],
    category: 'Utility',
    maintainer: 'SWEStash <swestash.admin@gmail.com>',
    executableName: 'galeo',
    // Files always follow `--`, so no name can pass as a switch (SR-13): `Exec=… -- %F`.
    executableArgs: ['--', '%F'],
    // StartupWMClass comes from package.json's desktopName, which Electron also uses as app_id.
    syncDesktopName: true,
    mimeTypes: MIME_TYPES,
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
    icon: 'packaging/icons/png/1024x1024.png',
    identity: null,
    // `gal`, which "Install command-line launcher" copies to ~/.local/bin/galeo.
    extraResources: [{ from: 'bin/gal', to: 'gal' }],
    // "Open With" for documents and data, never as their default app.
    fileAssociations: MAC_FILE_ASSOCIATIONS,
  },
  // The installer and the portable build for the runner's own architecture: CI builds x64 and arm64
  // on their own runners (both arches here would make one installer carrying the two).
  win: { target: ['nsis', 'portable'], icon: 'packaging/icons/png/1024x1024.png' },
  nsis: {
    oneClick: false,
    perMachine: false,
    artifactName: '${productName}-${version}-${arch}-setup.${ext}',
    // "Open with" for documents and data. electron-builder's own fileAssociations would make galeo the
    // types' default app and pass the file without `--` (SR-13), so the include registers them instead.
    include: 'packaging/windows/associations.nsh',
  },
  portable: { artifactName: '${productName}-${version}-${arch}-portable.${ext}' },
  publish: null,
};
