import { net, protocol } from 'electron';
import { pathToFileURL } from 'node:url';
import { resolveAppAsset } from './app-assets';

/** Must run before `app` is ready: `galeo:` is a standard, secure scheme for the app's own pages. */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'galeo', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** Serves the built renderer from `root` at `galeo://app/…`. */
export function registerAppProtocol(root: string): void {
  protocol.handle('galeo', (request) => {
    const file = resolveAppAsset(request.url, root);
    if (!file) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}
