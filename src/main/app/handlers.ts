import path from 'node:path';
import { appImageLauncher, installLauncher, launcherPaths, uninstallLauncher } from '../../core/desktop/launcher';
import type { InputCredits } from '../../core/documents/input-credits';
import type { FileSystem } from '../../core/ports';
import type { Utf8 } from '../../core/settings/json-file';
import type { AppInfo } from '../../shared/contracts';
import type { Handlers } from '../ipc/register';

type AppChannels = 'app.info' | 'app.installLauncher' | 'app.uninstallLauncher' | 'app.resolveSandboxUnavailable';

type Env = Readonly<Record<string, string | undefined>>;

/** The AppImage a packaged run came from (its runtime sets `APPIMAGE`), or null. */
export function appImagePath(packaged: boolean, env: Env): string | null {
  const appImage = packaged ? env['APPIMAGE'] : undefined;
  return appImage && path.isAbsolute(appImage) ? appImage : null;
}

/** `$XDG_DATA_DIRS`, keeping only absolute entries, else the XDG spec's default. */
function xdgDataDirs(env: Env): string[] {
  const dirs = (env['XDG_DATA_DIRS'] ?? '').split(':').filter((dir) => path.isAbsolute(dir));
  return dirs.length ? dirs : ['/usr/local/share', '/usr/share'];
}

/** `$XDG_DATA_HOME`, which the XDG spec says to ignore unless absolute, else `~/.local/share`. */
function xdgDataHome(home: string, env: Env): string {
  const configured = env['XDG_DATA_HOME'];
  return configured && path.isAbsolute(configured) ? configured : path.join(home, '.local', 'share');
}

/**
 * The app-level channels: start info, the sandbox choice, and installing the command-line launcher
 * for an AppImage. Changes beyond the page (a launcher) happen only on the reader's input (T6).
 */
export function appHandlers(deps: {
  info: (window: number) => AppInfo;
  sandboxChoice: {
    /** The app is still asking whether to run without the sandbox. */
    offered: () => boolean;
    quit: () => void;
    proceed: () => void;
  };
  launcher: {
    input: Pick<InputCredits, 'spend'>;
    fs: FileSystem;
    utf8: Utf8;
    appImage: string | null;
    home: string;
    /** The folder of the running executable, where `gal` ships. */
    execDir: string;
    /** The packaged app's resources: `icon.png` and `mime.xml`. */
    resourcesDir: string;
    env: Env;
    refreshMime: (database: string) => Promise<void>;
  };
}): Pick<Handlers, AppChannels> {
  const { info, sandboxChoice, launcher } = deps;
  const launcherDirs = () => {
    const dataHome = xdgDataHome(launcher.home, launcher.env);
    return {
      binDir: path.join(launcher.home, '.local', 'bin'),
      applicationsDir: path.join(dataHome, 'applications'),
      iconsDir: path.join(dataHome, 'icons'),
      mimeDir: path.join(dataHome, 'mime'),
    };
  };
  const bundledIcon = () => launcher.fs.readFile(path.join(launcher.resourcesDir, 'icon.png'), { maxBytes: 1024 * 1024 }).catch(() => null);
  return {
    'app.info': (_args, event) => info(event.sender.id),
    'app.installLauncher': async (_args, event) => {
      const { input, fs, utf8, appImage, execDir, resourcesDir, env, refreshMime } = launcher;
      if (!input.spend(event.sender.id)) throw new Error('no input');
      if (!appImage) throw new Error('not an AppImage');
      const script = utf8.decode(await fs.readFile(path.join(execDir, 'gal'), { maxBytes: 64 * 1024 }));
      const files = appImageLauncher(appImage, launcherDirs(), script);
      if (!files.ok) return files;
      const icon = await bundledIcon();
      const mime = await fs.readFile(path.join(resourcesDir, 'mime.xml'), { maxBytes: 64 * 1024 }).catch(() => null);
      const packageEntries = xdgDataDirs(env).map((dir) => path.join(dir, 'applications', 'galeo.desktop'));
      const installed = await installLauncher({ fs, utf8, refreshMime }, files, { icon, mime }, packageEntries);
      return installed.ok ? { ok: true, bin: files.bin.path } : installed;
    },
    'app.uninstallLauncher': async (_args, event) => {
      const { input, fs, utf8, appImage, refreshMime } = launcher;
      if (!input.spend(event.sender.id)) throw new Error('no input');
      if (!appImage) throw new Error('not an AppImage');
      return uninstallLauncher({ fs, utf8, refreshMime }, launcherPaths(launcherDirs()), await bundledIcon());
    },
    'app.resolveSandboxUnavailable': ([choice]) => {
      if (!sandboxChoice.offered()) throw new Error('sandbox choice not offered');
      if (choice === 'quit') sandboxChoice.quit();
      else sandboxChoice.proceed();
    },
  };
}
