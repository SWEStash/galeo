import { describe, expect, it } from 'vitest';
import { ImageGrants, imageTypeOf } from './images';

describe('imageTypeOf', () => {
  it.each([
    ['/d/a.png', 'image/png'],
    ['/d/a.JPG', 'image/jpeg'],
    ['/d/a.jpeg', 'image/jpeg'],
    ['/d/a.gif', 'image/gif'],
    ['/d/a.webp', 'image/webp'],
    ['/d/a.avif', 'image/avif'],
    ['/d/a.svg', 'image/svg+xml'],
    ['/d/a.bmp', 'image/bmp'],
    ['/d/a.ico', 'image/x-icon'],
  ])('knows %s as %s', (path, type) => {
    expect(imageTypeOf(path)).toBe(type);
  });

  it.each(['/d/notes.txt', '/d/page.html', '/d/script.js', '/d/noext', '/d/a.png.exe'])('refuses %s', (path) => {
    expect(imageTypeOf(path)).toBeNull();
  });
});

describe('ImageGrants', () => {
  function grants() {
    let n = 0;
    return new ImageGrants(() => `id-${++n}`);
  }

  it('grants an opaque id per image, found again only by its id', () => {
    const images = grants();
    const id = images.grant('/d/a.png', 1);
    expect(id).toBe('id-1');
    expect(images.lookup(id)).toEqual({ path: '/d/a.png', type: 'image/png' });
    expect(images.lookup('/d/a.png')).toBeNull();
    expect(images.lookup('id-2')).toBeNull();
  });

  it('reuses the grant for the same image in the same window', () => {
    const images = grants();
    expect(images.grant('/d/a.png', 1)).toBe(images.grant('/d/a.png', 1));
    expect(images.grant('/d/a.png', 2)).not.toBe(images.grant('/d/a.png', 1));
  });

  it("drops a window's grants when it closes", () => {
    const images = grants();
    const id = images.grant('/d/a.png', 1);
    const other = images.grant('/d/b.png', 2);
    images.closeWindow(1);
    expect(images.lookup(id)).toBeNull();
    expect(images.lookup(other)).not.toBeNull();
  });

  it('never grants a file that is not an image', () => {
    expect(() => grants().grant('/d/notes.txt', 1)).toThrow();
  });
});
