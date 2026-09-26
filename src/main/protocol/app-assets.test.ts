import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAppAsset } from './app-assets';

const ROOT = path.resolve('/opt/galeo/out/renderer');

describe('resolveAppAsset', () => {
  it('serves index.html for the root', () => {
    expect(resolveAppAsset('galeo://app/', ROOT)).toBe(path.join(ROOT, 'index.html'));
  });

  it('maps a path under the root', () => {
    expect(resolveAppAsset('galeo://app/assets/main-abc.js', ROOT)).toBe(
      path.join(ROOT, 'assets', 'main-abc.js'),
    );
  });

  it('ignores query and fragment', () => {
    expect(resolveAppAsset('galeo://app/index.html?x=1#top', ROOT)).toBe(path.join(ROOT, 'index.html'));
  });

  it.each([
    'galeo://app/..%2f..%2fetc%2fpasswd',
    'galeo://app/..%5c..%5cwindows',
    'galeo://app/index.html%00.png',
    'galeo://app/%E0%A4%A',
  ])('refuses to escape the root or odd encodings: %s', (url) => {
    expect(resolveAppAsset(url, ROOT)).toBeNull();
  });

  it('refuses other hosts of the scheme', () => {
    expect(resolveAppAsset('galeo://file/1', ROOT)).toBeNull();
  });
});
