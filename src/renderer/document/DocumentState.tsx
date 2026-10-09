import type { ReactNode } from 'react';
import type { DocumentContent } from '../../shared/contracts';
import { extensionOf } from '../../shared/paths';
import { formatBytes } from './format-bytes';

type Unready = Exclude<DocumentContent, { state: 'ready' }>;

function typeOf(path: string): string {
  const extension = extensionOf(path);
  return extension ? extension.slice(1).toUpperCase() : 'no extension';
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

export function DocumentState({
  content,
  onClose,
  onFileActions,
}: {
  content: Unready;
  onClose?: (() => void) | undefined;
  /** Main's menu for the file: open with the default app, reveal it, copy its path. */
  onFileActions?: (() => void) | undefined;
}) {
  const { title, detail } = describe(content);
  return (
    <section className="document-state" data-testid="document-state" data-state={content.state} role="status">
      <p className="document-state-title">{title}</p>
      {detail && <p className="document-state-detail">{detail}</p>}
      <p className="document-state-path">{content.path}</p>
      <div className="document-state-actions">
        {onClose && (
          <button type="button" onClick={onClose}>
            Close tab
          </button>
        )}
        {onFileActions && (
          <button type="button" onClick={onFileActions}>
            File actions…
          </button>
        )}
      </div>
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

export type BannerKind = 'too-large' | 'encoding' | 'render-failed' | 'render-slow' | 'syntax-error' | 'preview-failed' | 'preview-slow' | 'preview-syntax' | DiskChange;

/** What happened on disk to a file with unsaved edits (UX F12). */
export type DiskChange = 'disk-changed' | 'disk-deleted' | 'disk-unreadable';

const BANNERS: Record<BannerKind, { text: (detail?: string) => string; action?: string }> = {
  'too-large': { text: () => 'Large file shown as source', action: 'Render anyway' },
  encoding: { text: (encoding) => `Not valid UTF-8: shown as ${encoding}, the likeliest encoding` },
  'render-failed': { text: () => "This document couldn't be rendered — showing source", action: 'Try again' },
  'render-slow': { text: () => 'Too slow to render — showing source', action: 'Render anyway' },
  // MDX is strict; the detail says where ("on line 3: …"). Trying again can't help until the text changes.
  'syntax-error': { text: (where) => `MDX syntax error ${where} — showing source` },
  // Split while editing: the last good preview stays, and the next pause in typing tries again (ADR-014).
  'preview-failed': { text: () => "Preview paused: this document couldn't be rendered" },
  'preview-slow': { text: () => 'Preview paused: this document takes too long to render' },
  'preview-syntax': { text: (where) => `Preview paused: MDX syntax error ${where}` },
  'disk-changed': { text: () => 'File changed on disk' },
  'disk-deleted': { text: () => 'File deleted on disk' },
  'disk-unreadable': { text: () => "File changed on disk and can't be shown as text" },
};

export function DocumentBanner({
  kind,
  detail,
  onAction,
  actions = [],
  children,
}: {
  kind: BannerKind;
  detail?: string;
  onAction?: () => void;
  /** Buttons of its own, for a banner that offers a choice. */
  actions?: readonly { label: string; onAction: () => void }[];
  /** An action of its own (a menu), instead of the banner's button. */
  children?: ReactNode;
}) {
  const banner = BANNERS[kind];
  return (
    <div className="document-banner" data-testid="document-banner" data-banner={kind} role="status">
      <span>{banner.text(detail)}</span>
      {banner.action && onAction && (
        <button type="button" onClick={onAction}>
          {banner.action}
        </button>
      )}
      {actions.map(({ label, onAction: act }) => (
        <button key={label} type="button" onClick={act}>
          {label}
        </button>
      ))}
      {children}
    </div>
  );
}
