import { protocol } from 'electron';
import { readFile } from 'node:fs/promises';
import { contentTypeFor, resolveAppAsset } from './app-assets';

/** Must run before `app` is ready: `galeo:` is a standard, secure scheme for the app's own pages. */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'galeo', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/**
 * Serves the built renderer from `root` at `galeo://app/…`, with `headers` (the CSP) on every
 * response. Files are read from disk directly: a `file:` fetch would itself be a request that the
 * network guard cancels.
 */
export function registerAppProtocol(root: string, headers: Record<string, string>): void {
  protocol.handle('galeo', async (request) => {
    const file = resolveAppAsset(request.url, root);
    const body = file ? await readFile(file).catch(() => null) : null;
    if (!file || !body) return new Response(null, { status: 404, headers });
    return new Response(body, { headers: { ...headers, 'Content-Type': contentTypeFor(file) } });
  });
}
