import { describe, expect, it } from 'vitest';
import { FsError, type FileSystem } from '../../core/ports';
import { IMAGE_RESPONSE_CSP, imageIdFromUrl, serveImage } from './file-images';

describe('imageIdFromUrl', () => {
  it('reads the grant id of galeo://file/<id>', () => {
    expect(imageIdFromUrl('galeo://file/0b6c1d2e-8f1a-4c3b-9d4e-5f6a7b8c9d0e')).toBe('0b6c1d2e-8f1a-4c3b-9d4e-5f6a7b8c9d0e');
  });

  it.each([
    'galeo://app/index.html',
    'galeo://file/',
    'galeo://file/a/b',
    'galeo://file/%2e%2e',
    'galeo://file/../etc/passwd',
    'galeo://file/id?x=1',
    'galeo://file/id#x',
    'not a url',
  ])('refuses %s', (url) => {
    expect(imageIdFromUrl(url)).toBeNull();
  });
});

describe('serveImage', () => {
  const fs = (files: Record<string, Uint8Array | 'toobig' | 'missing'>): FileSystem => ({
    stat: async () => {
      throw new Error('unused');
    },
    realpath: async (path) => path,
    async *readDir() {},
    readFile: async (path, { maxBytes }) => {
      const file = files[path];
      if (file === 'toobig') throw new FsError('ETOOBIG', path);
      if (!file || file === 'missing') throw new FsError('ENOENT', path);
      if (file.byteLength > maxBytes) throw new FsError('ETOOBIG', path);
      return file;
    },
  });
  const lookup = (id: string) => (id === 'ok' ? { path: '/d/a.png', type: 'image/png' } : null);

  it('serves a granted image with its type, nothing to sniff and a sandboxing policy', async () => {
    const response = await serveImage('galeo://file/ok', { lookup, fs: fs({ '/d/a.png': Uint8Array.from([1, 2, 3]) }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Security-Policy')).toBe(IMAGE_RESPONSE_CSP);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  it('answers 404 for an id main never granted, and for a granted file now gone or too large', async () => {
    expect((await serveImage('galeo://file/guess', { lookup, fs: fs({}) })).status).toBe(404);
    expect((await serveImage('galeo://file/ok', { lookup, fs: fs({ '/d/a.png': 'missing' }) })).status).toBe(404);
    expect((await serveImage('galeo://file/ok', { lookup, fs: fs({ '/d/a.png': 'toobig' }) })).status).toBe(404);
  });
});
