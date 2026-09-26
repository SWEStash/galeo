import { describe, expect, it } from 'vitest';
import { APP_CSP, appResponseHeaders, isRequestAllowed } from './network-policy';

const prod = { devServerOrigin: null, allowDevTools: false };
const dev = { devServerOrigin: 'http://127.0.0.1:5173', allowDevTools: true };

describe('isRequestAllowed', () => {
  it.each(['galeo://app/index.html', 'galeo://file/abc', 'GALEO://app/x.js', 'data:image/png;base64,AAAA'])(
    'allows the app protocol and data URLs: %s',
    (url) => {
      expect(isRequestAllowed(url, prod)).toBe(true);
    },
  );

  it.each([
    'https://example.com/',
    'http://127.0.0.1:5173/',
    'ws://127.0.0.1:5173/',
    'wss://example.com/socket',
    'ftp://example.com/x',
    'file:///etc/passwd',
    'devtools://devtools/bundled/index.html',
    'blob:galeo://app/1234',
    'not a url',
    '',
  ])('cancels everything else in packaged builds: %s', (url) => {
    expect(isRequestAllowed(url, prod)).toBe(false);
  });

  it('allows the exact dev server origin and its hot-reload socket in development runs', () => {
    expect(isRequestAllowed('http://127.0.0.1:5173/src/main.tsx', dev)).toBe(true);
    expect(isRequestAllowed('ws://127.0.0.1:5173/?token=x', dev)).toBe(true);
    expect(isRequestAllowed('devtools://devtools/bundled/index.html', dev)).toBe(true);
  });

  it.each(['http://127.0.0.1:5174/', 'http://localhost:5173/', 'https://127.0.0.1:5173/', 'https://example.com/'])(
    'still cancels other hosts in development runs: %s',
    (url) => {
      expect(isRequestAllowed(url, dev)).toBe(false);
    },
  );
});

describe('appResponseHeaders', () => {
  it('sends the strict CSP on every app response (SR-02)', () => {
    const headers = appResponseHeaders({ isPackaged: true });
    expect(headers['Content-Security-Policy']).toBe(APP_CSP);
    expect(APP_CSP).toContain("default-src 'none'");
    expect(APP_CSP).toContain("script-src 'self'");
    expect(APP_CSP).not.toMatch(/unsafe-eval|wasm-unsafe-eval/);
  });

  it('reports Trusted Types violations in development builds only', () => {
    expect(appResponseHeaders({ isPackaged: false })['Content-Security-Policy-Report-Only']).toBe(
      "require-trusted-types-for 'script'; trusted-types galeo-document",
    );
    expect(appResponseHeaders({ isPackaged: true })).not.toHaveProperty('Content-Security-Policy-Report-Only');
  });
});
