import { hasScheme, isNetworkPathReference } from '../../shared/markdown/urls';

type LinkTarget =
  | { kind: 'anchor'; anchor: string }
  | { kind: 'file'; path: string; anchor: string | null }
  | { kind: 'external'; url: string }
  | { kind: 'refused'; reason: 'scheme' | 'host' | 'malformed' };

export interface LinkContext {
  /** The document the link is in, as main read it. */
  documentPath: string;
  dirname: (path: string) => string;
  resolve: (directory: string, relative: string) => string;
  /** The WHATWG URL parser, injected so core stays free of runtime globals. */
  parseUrl: (href: string) => { protocol: string; href: string } | null;
}

/** Two slashes or backslashes: a UNC path (\\host\share) or a device path (\\?\), never local. */
const NETWORK_PATH = /^[\\/]{2}/;

/** macOS mounts network shares on demand under these. */
const AUTOMOUNTED = /^\/(net|Network)\//;

/** The only schemes handed to the OS (SR-04); local files always open inside galeo (SR-05). */
const EXTERNAL = new Set(['http:', 'https:', 'mailto:']);

function decode(text: string): string | null {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}

/**
 * What following `href` means: a place in this document, a local file, an external URL, or
 * nothing. Main calls this only for hrefs in the document's own link set.
 */
export function classifyLink(href: string, context: LinkContext): LinkTarget {
  if (hasScheme(href)) {
    const url = context.parseUrl(href);
    if (!url) return { kind: 'refused', reason: 'malformed' };
    return EXTERNAL.has(url.protocol.toLowerCase()) ? { kind: 'external', url: url.href } : { kind: 'refused', reason: 'scheme' };
  }
  if (isNetworkPathReference(href)) return { kind: 'refused', reason: 'host' };

  const hash = href.indexOf('#');
  const fragment = hash === -1 ? null : decode(href.slice(hash + 1));
  if (hash !== -1 && fragment === null) return { kind: 'refused', reason: 'malformed' };
  const beforeHash = hash === -1 ? href : href.slice(0, hash);
  const query = beforeHash.indexOf('?');
  const encodedPath = query === -1 ? beforeHash : beforeHash.slice(0, query);
  if (encodedPath === '') return { kind: 'anchor', anchor: fragment ?? '' };
  const relative = decode(encodedPath);
  if (relative === null) return { kind: 'refused', reason: 'malformed' };
  // Decoding can spell a host too (`%5C%5Chost`): a UNC or device path would reach the network
  // through the file system, where no network guard sees it.
  if (NETWORK_PATH.test(relative)) return { kind: 'refused', reason: 'host' };
  const path = context.resolve(context.dirname(context.documentPath), relative);
  if (NETWORK_PATH.test(path) || AUTOMOUNTED.test(path)) return { kind: 'refused', reason: 'host' };
  return { kind: 'file', path, anchor: fragment };
}
