// How browsers read the start of a URL, for deciding what a document's links and images point at.

/** Browsers ignore whitespace and control characters in a URL's scheme and leading slashes. */
export function compactUrl(url: string): string {
  return url.replace(/[\u0000- ]/g, '');
}

/** The URL names its own scheme (`https:`, `javascript:`, …). */
export function hasScheme(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(compactUrl(url));
}

/** `//host/path` (or with backslashes, which browsers treat as slashes): another host. */
export function isNetworkPathReference(url: string): boolean {
  return /^[\\/]{2}/.test(compactUrl(url));
}

/** A path relative to the document: no scheme and no host. */
export function isLocalReference(url: string): boolean {
  return !isNetworkPathReference(url) && !hasScheme(url);
}
