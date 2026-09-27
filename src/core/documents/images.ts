import { extensionOf } from '../../shared/paths';

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  // As an <img>, SVG is only a picture: no script runs and nothing loads from it.
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
};

/** Local images larger than this are not shown. */
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;

/** The image type of a file by its extension, or null for anything that isn't an image. */
export function imageTypeOf(path: string): string | null {
  return IMAGE_TYPES[extensionOf(path)] ?? null;
}

/**
 * Images main has let a window show (ADR-004): the page gets an opaque, unguessable id for
 * `galeo://file/<id>`, never a path, and the protocol serves only ids granted here.
 */
export class ImageGrants {
  private readonly byId = new Map<string, { path: string; type: string; window: number }>();

  constructor(private readonly randomId: () => string) {}

  grant(path: string, window: number): string {
    const type = imageTypeOf(path);
    if (!type) throw new Error('not an image');
    for (const [id, image] of this.byId) if (image.path === path && image.window === window) return id;
    let id = this.randomId();
    while (this.byId.has(id)) id = this.randomId();
    this.byId.set(id, { path, type, window });
    return id;
  }

  lookup(id: string): { path: string; type: string } | null {
    const image = this.byId.get(id);
    return image ? { path: image.path, type: image.type } : null;
  }

  closeWindow(window: number): void {
    for (const [id, image] of this.byId) if (image.window === window) this.byId.delete(id);
  }
}
