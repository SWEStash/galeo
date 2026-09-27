import { IMAGE_MAX_BYTES } from '../../core/documents/images';
import { FsError, type FileSystem } from '../../core/ports';

/**
 * Served images get nothing else: even an SVG opened on its own can't run script or load
 * anything, and it can't pose as an app page.
 */
export const IMAGE_RESPONSE_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox";

/** The grant id of a `galeo://file/<id>` URL, or null for any other shape. */
export function imageIdFromUrl(requestUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.host !== 'file' || url.search || url.hash) return null;
  const match = /^\/([A-Za-z0-9-]+)$/.exec(url.pathname);
  return match ? match[1]! : null;
}

/** Answers a `galeo://file/…` request with the granted image, or 404 (ADR-004). */
export async function serveImage(
  requestUrl: string,
  deps: { lookup: (id: string) => { path: string; type: string } | null; fs: FileSystem },
): Promise<Response> {
  const id = imageIdFromUrl(requestUrl);
  const image = id ? deps.lookup(id) : null;
  if (!image) return new Response(null, { status: 404 });
  try {
    const body = await deps.fs.readFile(image.path, { maxBytes: IMAGE_MAX_BYTES });
    return new Response(body, {
      headers: {
        'Content-Type': image.type,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': IMAGE_RESPONSE_CSP,
      },
    });
  } catch (error) {
    if (error instanceof FsError) return new Response(null, { status: 404 });
    throw error;
  }
}
