import { createReadStream, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
};

/** A static server for `dir` on 127.0.0.1, as Pages serves it (no headers of its own), counting what it sends. */
export async function serveStatic(dir: string): Promise<{ url: string; sent: () => number; close: () => Promise<void> }> {
  let sent = 0;
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const file = path.join(dir, decodeURIComponent(url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname));
    let size: number;
    try {
      if (!file.startsWith(dir)) throw new Error('outside');
      size = statSync(file).size;
    } catch {
      response.writeHead(404).end();
      return;
    }
    sent += size;
    response.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Content-Length': size });
    createReadStream(file).pipe(response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}/`, sent: () => sent, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
