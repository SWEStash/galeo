import { describe, expect, it } from 'vitest';
import { rendererUrl, trustedOrigins } from './renderer-entry';

describe('rendererUrl', () => {
  const env = { GALEO_DEV_SERVER_URL: 'http://127.0.0.1:5173/' };

  it('uses the dev server URL in development runs', () => {
    expect(rendererUrl({ isPackaged: false, env })).toBe('http://127.0.0.1:5173/');
  });

  it('ignores the dev server URL in packaged builds', () => {
    expect(rendererUrl({ isPackaged: true, env })).toBe('galeo://app/index.html');
  });

  it('loads the built renderer when no dev server is set', () => {
    expect(rendererUrl({ isPackaged: false, env: {} })).toBe('galeo://app/index.html');
  });
});

describe('trustedOrigins', () => {
  const env = { GALEO_DEV_SERVER_URL: 'http://127.0.0.1:5173/' };

  it('trusts only the app origin by default', () => {
    expect([...trustedOrigins({ isPackaged: false, env: {} })]).toEqual(['galeo://app']);
  });

  it('also trusts the exact dev server origin in development runs', () => {
    expect([...trustedOrigins({ isPackaged: false, env })]).toEqual(['galeo://app', 'http://127.0.0.1:5173']);
  });

  it('never trusts the dev server origin in packaged builds', () => {
    expect([...trustedOrigins({ isPackaged: true, env })]).toEqual(['galeo://app']);
  });
});
