import type { DocumentContent } from '../../shared/contracts';
import { formatBytes } from './format-bytes';

type Unready = Exclude<DocumentContent, { state: 'ready' }>;

function typeOf(path: string): string {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toUpperCase() : 'no extension';
}

/** What a document shows instead of its content (UX §4). */
function describe(content: Unready): { title: string; detail?: string } {
  switch (content.state) {
    case 'empty':
      return { title: 'This file is empty' };
    case 'missing':
      return { title: 'File not found' };
    case 'no-permission':
      return { title: "galeo can't read this file (permission denied)" };
    case 'binary':
      return { title: 'This looks like a binary file', detail: `${formatBytes(content.size)} · ${typeOf(content.path)}` };
    case 'not-a-file':
      return { title: "This isn't a regular file" };
    case 'too-large':
      return { title: 'This file is too large to open', detail: `Files over ${formatBytes(content.maxBytes)} aren't opened` };
    case 'unreadable':
      return { title: "galeo can't read this file" };
  }
}

export function DocumentState({ content }: { content: Unready }) {
  const { title, detail } = describe(content);
  return (
    <section className="document-state" data-testid="document-state" data-state={content.state} role="status">
      <p className="document-state-title">{title}</p>
      {detail && <p className="document-state-detail">{detail}</p>}
      <p className="document-state-path">{content.path}</p>
    </section>
  );
}

/** Skeleton lines in the reading column; shown only for slow loads (no spinner, UX §4). */
export function DocumentLoading() {
  return (
    <div className="document-loading" data-testid="document-loading" role="status" aria-label="Loading document">
      {[92, 100, 84, 96, 60].map((width, index) => (
        <span key={index} className="document-loading-line" style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}

export type BannerKind = 'too-large' | 'encoding' | 'render-failed';

const BANNERS: Record<BannerKind, { text: (detail?: string) => string; action?: string }> = {
  'too-large': { text: () => 'Large file shown as source', action: 'Render anyway' },
  encoding: { text: (encoding) => `Not valid UTF-8: shown as ${encoding}, the likeliest encoding` },
  'render-failed': { text: () => "This document couldn't be rendered — showing source", action: 'Try again' },
};

export function DocumentBanner({ kind, detail, onAction }: { kind: BannerKind; detail?: string; onAction?: () => void }) {
  const banner = BANNERS[kind];
  return (
    <div className="document-banner" data-testid="document-banner" data-banner={kind} role="status">
      <span>{banner.text(detail)}</span>
      {banner.action && onAction && (
        <button type="button" onClick={onAction}>
          {banner.action}
        </button>
      )}
    </div>
  );
}
