import path from 'node:path';

/**
 * Maps a `galeo://app/…` URL to a file under the built renderer `root`, or null when the URL is for
 * another host, is badly encoded, or would leave `root`.
 */
export function resolveAppAsset(requestUrl: string, root: string): string | null {
  let pathname: string;
  try {
    const url = new URL(requestUrl);
    if (url.host !== 'app') return null;
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0') || pathname.includes('\\')) return null;
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.resolve(root, relative);
  return file.startsWith(root + path.sep) ? file : null;
}
