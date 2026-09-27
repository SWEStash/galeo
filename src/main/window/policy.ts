/** Every permission is denied except sanitized clipboard writes, used by copy buttons (SR-01). */
export function isPermissionAllowed(permission: string): boolean {
  return permission === 'clipboard-sanitized-write';
}

/** Window titles carry a non-dismissable warning while the process runs unsandboxed (ADR-008). */
export function windowTitle(title: string, { sandboxed }: { sandboxed: boolean }): string {
  return sandboxed ? title : `${title} — unsandboxed`;
}

/**
 * The app's own arguments from `process.argv`: after the executable, and after the app path too
 * when Electron runs an unpackaged app (`electron .`, `process.defaultApp`).
 */
export function ownArgs(argv: readonly string[], { defaultApp }: { defaultApp: boolean }): string[] {
  return argv.slice(defaultApp ? 2 : 1);
}

/** The only `webPreferences` any galeo window gets (SR-01). */
export function hardenedWebPreferences({ preload, isPackaged }: { preload: string; isPackaged: boolean }) {
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
  };
}
