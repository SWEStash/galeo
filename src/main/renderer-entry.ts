const APP_ORIGIN = 'galeo://app';

interface RuntimeContext {
  isPackaged: boolean;
  env: Record<string, string | undefined>;
}

/** The Vite dev server, honoured only in development runs (never in packaged builds). */
function devServerUrl({ isPackaged, env }: RuntimeContext): string | undefined {
  return isPackaged ? undefined : env['GALEO_DEV_SERVER_URL'] || undefined;
}

/**
 * Where a window loads its UI from: the Vite dev server in development runs, otherwise the built
 * renderer served over `galeo://app`. Packaged builds never honour the dev server variable, so the
 * environment can't point the installed app at another page.
 */
export function rendererUrl(context: RuntimeContext): string {
  return devServerUrl(context) ?? `${APP_ORIGIN}/index.html`;
}

/** The dev server's origin in development runs; null otherwise (always in packaged builds). */
export function devServerOrigin(context: RuntimeContext): string | null {
  const dev = devServerUrl(context);
  return dev ? new URL(dev).origin : null;
}

/** Origins whose main frame may call IPC: the app, plus the dev server in development runs. */
export function trustedOrigins(context: RuntimeContext): ReadonlySet<string> {
  const dev = devServerOrigin(context);
  return new Set(dev ? [APP_ORIGIN, dev] : [APP_ORIGIN]);
}
