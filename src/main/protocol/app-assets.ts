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

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** The Content-Type for a built renderer asset; unknown files get one that never executes. */
export function contentTypeFor(file: string): string {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}
