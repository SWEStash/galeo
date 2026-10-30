import path from 'node:path';
import { appCommand, appCommandPath, appImageLauncher, installAppCommand, installLauncher, launcherPaths, uninstallAppCommand, uninstallLauncher } from '../../core/desktop/launcher';
import type { InputCredits } from '../../core/documents/input-credits';
import type { FileSystem } from '../../core/ports';
import type { Utf8 } from '../../core/settings/json-file';
import type { AppInfo } from '../../shared/contracts';
import type { Handlers } from '../ipc/register';

type AppChannels = 'app.info' | 'app.installLauncher' | 'app.uninstallLauncher' | 'app.resolveSandboxUnavailable';

type Env = Readonly<Record<string, string | undefined>>;

/** What "Install command-line launcher" installs for: an AppImage on Linux, the app on macOS and Windows. */
export type LauncherTarget =
  | { kind: 'appimage'; appImage: string }
  | { kind: 'app'; platform: 'darwin' | 'win32'; exe: string; binDir: string };

/**
 * The launcher a packaged run can install, or null (a dev run, the .deb, which ships `galeo` itself).
 * Linux: the AppImage it came from (its runtime sets `APPIMAGE`). macOS: `~/.local/bin`. Windows:
 * `%LOCALAPPDATA%\Microsoft\WindowsApps`, on the user's PATH by default; the portable build runs
 * from a temporary copy, so its command points at the file the user has (`PORTABLE_EXECUTABLE_FILE`).
 */
export function launcherTarget(run: { packaged: boolean; platform: NodeJS.Platform; env: Env; execPath: string; home: string }): LauncherTarget | null {
  const { packaged, platform, env, execPath, home } = run;
  if (!packaged) return null;
  if (platform === 'darwin') return { kind: 'app', platform, exe: execPath, binDir: path.posix.join(home, '.local', 'bin') };
  if (platform === 'win32') {
    const localAppData = env['LOCALAPPDATA'];
    if (!localAppData || !path.win32.isAbsolute(localAppData)) return null;
    const portable = env['PORTABLE_EXECUTABLE_FILE'];
    const exe = portable && path.win32.isAbsolute(portable) ? portable : execPath;
    return { kind: 'app', platform, exe, binDir: path.win32.join(localAppData, 'Microsoft', 'WindowsApps') };
  }
  const appImage = env['APPIMAGE'];
  return appImage && path.posix.isAbsolute(appImage) ? { kind: 'appimage', appImage } : null;
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
 * The app-level channels: start info, the sandbox choice, and installing the command-line launcher. Changes beyond the page (a launcher) happen only on the reader's input (T6).
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
    target: LauncherTarget | null;
    home: string;
    /** The folder of the running executable, where `gal` ships on Linux. */
    execDir: string;
    /** The packaged app's resources: `icon.png` and `mime.xml` on Linux, `gal` on macOS. */
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
      const { input, fs, utf8, target, execDir, resourcesDir, env, refreshMime } = launcher;
      if (!input.spend(event.sender.id)) throw new Error('no input');
      if (!target) throw new Error('no launcher for this run');
      const gal = async (dir: string) => utf8.decode(await fs.readFile(path.join(dir, 'gal'), { maxBytes: 64 * 1024 }));
      if (target.kind === 'app') {
        const command = appCommand(target.platform, target.exe, target.binDir, target.platform === 'darwin' ? await gal(resourcesDir) : null);
        if (!command.ok) return command;
        const installed = await installAppCommand({ fs, utf8 }, command);
        return installed.ok ? { ok: true, bin: command.path } : installed;
      }
      const files = appImageLauncher(target.appImage, launcherDirs(), await gal(execDir));
      if (!files.ok) return files;
      const icon = await bundledIcon();
      const mime = await fs.readFile(path.join(resourcesDir, 'mime.xml'), { maxBytes: 64 * 1024 }).catch(() => null);
      const packageEntries = xdgDataDirs(env).map((dir) => path.join(dir, 'applications', 'galeo.desktop'));
      const installed = await installLauncher({ fs, utf8, refreshMime }, files, { icon, mime }, packageEntries);
      return installed.ok ? { ok: true, bin: files.bin.path } : installed;
    },
    'app.uninstallLauncher': async (_args, event) => {
      const { input, fs, utf8, target, refreshMime } = launcher;
      if (!input.spend(event.sender.id)) throw new Error('no input');
      if (!target) throw new Error('no launcher for this run');
      if (target.kind === 'app') return uninstallAppCommand({ fs, utf8 }, appCommandPath(target.platform, target.binDir));
      return uninstallLauncher({ fs, utf8, refreshMime }, launcherPaths(launcherDirs()), await bundledIcon());
    },
    'app.resolveSandboxUnavailable': ([choice]) => {
      if (!sandboxChoice.offered()) throw new Error('sandbox choice not offered');
      if (choice === 'quit') sandboxChoice.quit();
      else sandboxChoice.proceed();
    },
  };
}
