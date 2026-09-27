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
  const headers: Record<string, string> = { 'Content-Security-Policy': APP_CSP };
  if (!isPackaged) headers['Content-Security-Policy-Report-Only'] = TRUSTED_TYPES;
  return headers;
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

/**
 * Chromium host-resolver rules that make every host unresolvable, IP literals included, so
 * nothing in the network stack can open a socket, whether a request reaches `webRequest` or not.
 * Development runs exempt only the dev server's host.
 */
export function hostResolverRules(devServerOrigin: string | null): string {
  return devServerOrigin ? `MAP * ~NOTFOUND, EXCLUDE ${new URL(devServerOrigin).hostname}` : 'MAP * ~NOTFOUND';
}

/**
 * Both zero-network layers are always on in packaged builds. Unpackaged test runs may switch
 * each off, so the no-network harness can show it detects real traffic (SR-07).
 */
export function networkLockdown({
  isPackaged,
  env,
}: {
  isPackaged: boolean;
  env: Record<string, string | undefined>;
}): { guard: boolean; resolver: boolean } {
  if (isPackaged) return { guard: true, resolver: true };
  return {
    guard: env['GALEO_TEST_DISABLE_NETWORK_GUARD'] !== '1',
    resolver: env['GALEO_TEST_DISABLE_RESOLVER_LOCKDOWN'] !== '1',
  };
}
