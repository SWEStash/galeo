/**
 * The app pages' Content-Security-Policy (SR-02), plus `base-uri`/`form-action`/`frame-ancestors`,
 * which `default-src` doesn't cover.
 */
export const APP_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' galeo: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Trusted Types: report-only while developing, enforced in release builds later. */
const TRUSTED_TYPES = "require-trusted-types-for 'script'; trusted-types galeo-document";

export function appResponseHeaders({ isPackaged }: { isPackaged: boolean }): Record<string, string> {
  return isPackaged
    ? { 'Content-Security-Policy': APP_CSP }
    : { 'Content-Security-Policy': APP_CSP, 'Content-Security-Policy-Report-Only': TRUSTED_TYPES };
}

export interface NetworkPolicy {
  /** The Vite dev server origin in unpackaged development runs, else null. */
  devServerOrigin: string | null;
  /** DevTools' own frontend, available in unpackaged builds only. */
  allowDevTools: boolean;
}

/** Zero network (SR-06): only the app protocol and data URLs load, plus the dev server in dev. */
export function isRequestAllowed(url: string, policy: NetworkPolicy): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === 'galeo:' || parsed.protocol === 'data:') return true;
  if (parsed.protocol === 'devtools:') return policy.allowDevTools;
  if (policy.devServerOrigin) {
    const dev = new URL(policy.devServerOrigin);
    const sameHost = parsed.host === dev.host;
    if (sameHost && parsed.protocol === dev.protocol) return true;
    if (sameHost && dev.protocol === 'http:' && parsed.protocol === 'ws:') return true;
  }
  return false;
}
