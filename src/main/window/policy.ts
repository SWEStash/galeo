import { mainCommandFor, type Command, type Platform } from '../../shared/keymap';
import type { StartInfo } from '../../shared/contracts';
import { startInfoArg } from '../../shared/start-info';
/** Every permission is denied except sanitized clipboard writes, used by copy buttons (SR-01). */
export function isPermissionAllowed(permission: string): boolean {
  return permission === 'clipboard-sanitized-write';
}

/** Window titles carry a non-dismissable warning while the process runs unsandboxed (ADR-008). */
/** `<file> — <profile> — galeo` (UX), leaving out missing parts; every title says when unsandboxed. */
export function windowTitle(parts: readonly (string | null)[], { sandboxed }: { sandboxed: boolean }): string {
  const title = [...parts.filter((part) => part !== null), 'galeo'].join(' — ');
  return sandboxed ? title : `${title} — unsandboxed`;
}

/**
 * The app's own arguments from `process.argv`: after the executable, and after the app path too
 * when Electron runs an unpackaged app (`electron .`, `process.defaultApp`).
 */
export function ownArgs(argv: readonly string[], { defaultApp }: { defaultApp: boolean }): string[] {
  return argv.slice(defaultApp ? 2 : 1);
}

/**
 * The window icon: Linux only, where X11 and a checkout take it from the window. macOS and Windows
 * take theirs from the app bundle.
 */
export function appIcon({ platform, isPackaged, resourcesPath, appPath }: { platform: NodeJS.Platform; isPackaged: boolean; resourcesPath: string; appPath: string }): string | undefined {
  if (platform !== 'linux') return undefined;
  return isPackaged ? `${resourcesPath}/icon.png` : `${appPath}/packaging/icons/png/256x256.png`;
}

/** The only `webPreferences` any galeo window gets (SR-01). */
export function hardenedWebPreferences({ preload, isPackaged, startInfo }: { preload: string; isPackaged: boolean; startInfo: StartInfo }) {
  return {
    preload,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    // A reader has nothing to spell-check.
    spellcheck: false,
    devTools: !isPackaged,
    // What the page needs to paint, without waiting on main (start-info.ts).
    additionalArguments: [startInfoArg(startInfo)],
  };
}

/** The tab bar's height in CSS pixels; the window controls drawn over it match (ADR-006). */
export const TAB_BAR_HEIGHT = 36;

/**
 * The window has no title bar: the tab bar is the title bar, and Electron draws the platform's
 * window controls over its end, in its colours (`--galeo-color-code-bg` and `--galeo-color-fg`).
 */
export function titleBarOverlay(scheme: 'light' | 'dark') {
  return scheme === 'dark'
    ? { color: '#161b22', symbolColor: '#e6edf3', height: TAB_BAR_HEIGHT }
    : { color: '#f6f8fa', symbolColor: '#1f2328', height: TAB_BAR_HEIGHT };
}

/** The part of Electron's `Input` (from `before-input-event`) key matching needs. */
interface KeyInput {
  type: string;
  key: string;
  control: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  isAutoRepeat?: boolean;
}

/** The command a key press is that main handles before the page sees it (capabilities, ADR-004; window keys). */
export function mainKey(input: KeyInput, platform: Platform): Command | null {
  if (input.type !== 'keyDown' || input.isAutoRepeat) return null;
  return mainCommandFor(
    { key: input.key, ctrlKey: input.control, altKey: input.alt, shiftKey: input.shift, metaKey: input.meta },
    platform,
  );
}

/** The keymap's platforms; other Unixes follow the Linux conventions. */
export function keymapPlatform(platform: NodeJS.Platform): Platform {
  return platform === 'darwin' || platform === 'win32' ? platform : 'linux';
}
