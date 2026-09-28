import type { LinkTarget } from '../../shared/contracts';
import type { FollowResult, HistoryResult, ImageResult } from '../../shared/documents';
import type { References } from '../../shared/markdown/references';
import { classifyLink, type LinkContext } from '../links/classify';
import type { ExternalOpenLimiter } from '../links/limiter';
import { FsError, type FileSystem, type OsShell, type TaskRunner } from '../ports';
import { IMAGE_MAX_BYTES, imageTypeOf, type ImageGrants } from './images';
import type { HistoryEntry, TabRegistry } from '../tabs/registry';

/** Extraction runs in a worker thread; hostile Markdown gets this long before it's abandoned. */
const REFERENCES_TIMEOUT_MS = 2000;

export interface DocumentLinksDeps extends Omit<LinkContext, 'documentPath'> {
  records: TabRegistry;
  fs: FileSystem;
  images: ImageGrants;
  /** Runs the `references` task (the shared extractor) off the main thread. */
  tasks: TaskRunner;
  shell: OsShell;
  limiter: ExternalOpenLimiter;
  /** Asks the user, in a native dialog, whether a document may keep opening links. */
  confirmBurst: (window: number) => Promise<boolean>;
}

interface Read {
  path: string;
  text: string;
  references?: Promise<References | null>;
}

/**
 * Following links (ADR-004): main checks each href against the links of the document it read
 * itself, so a compromised page can neither read other files nor build URLs for the browser.
 */
export class DocumentLinks {
  private readonly reads = new Map<string, Read>();
  /** Documents whose burst confirmation is on screen; their other opens wait for the answer. */
  private readonly confirming = new Set<string>();

  constructor(private readonly deps: DocumentLinksDeps) {}

  /**
   * The text main just read from `path`: its links are the only ones that can be followed. A read
   * that finishes after the document moved on to another file is ignored.
   */
  remember(id: string, window: number, path: string, text: string): void {
    if (this.deps.records.get(id, window)?.path === path) this.reads.set(id, { path, text });
  }

  /** With `background`, a local link opens in a new tab after the active one; this tab stays put. */
  async follow(id: string, window: number, href: string, where: LinkTarget = 'current'): Promise<FollowResult> {
    const found = await this.references(id, window);
    if (found === 'unavailable') return refused('unavailable');
    if (!found || !found.references.links.includes(href)) return refused('not-in-document');
    const { record } = found;

    const target = classifyLink(href, { ...this.deps, documentPath: record.path });
    if (where === 'background' && (target.kind === 'anchor' || target.kind === 'file')) {
      this.deps.records.open(target.kind === 'file' ? target.path : record.path, window, target.anchor);
      return { kind: 'opened' };
    }
    switch (target.kind) {
      case 'anchor':
        this.deps.records.navigate(id, window, { path: record.path, anchor: target.anchor });
        return { kind: 'anchor', anchor: target.anchor };
      case 'file':
        this.deps.records.navigate(id, window, { path: target.path, anchor: target.anchor });
        return { kind: 'navigated', anchor: target.anchor };
      case 'external':
        return this.openExternal(id, window, target.url);
      case 'refused':
        return refused(target.reason);
    }
  }

  /** Grants a local image the document shows, as an opaque URL the page can load (ADR-004). */
  async resolveImage(id: string, window: number, src: string): Promise<ImageResult> {
    const found = await this.references(id, window);
    if (found === 'unavailable') return { kind: 'refused', reason: 'unavailable' };
    if (!found || !found.references.images.includes(src)) return { kind: 'refused', reason: 'not-in-document' };
    const target = classifyLink(src, { ...this.deps, documentPath: found.record.path });
    if (target.kind !== 'file' || !imageTypeOf(target.path)) return { kind: 'refused', reason: 'not-an-image' };
    try {
      const stat = await this.deps.fs.stat(target.path);
      if (stat.kind !== 'file') return { kind: 'refused', reason: 'not-an-image' };
      if (stat.size > IMAGE_MAX_BYTES) return { kind: 'refused', reason: 'too-large' };
    } catch (error) {
      if (error instanceof FsError) return { kind: 'refused', reason: 'missing' };
      throw error;
    }
    return { kind: 'image', url: `galeo://file/${this.deps.images.grant(target.path, window)}` };
  }

  back(id: string, window: number): Promise<HistoryResult> {
    return Promise.resolve(this.step(id, window, (records) => records.back(id, window)));
  }

  forward(id: string, window: number): Promise<HistoryResult> {
    return Promise.resolve(this.step(id, window, (records) => records.forward(id, window)));
  }

  forget(id: string): void {
    this.reads.delete(id);
  }

  private async openExternal(id: string, window: number, url: string): Promise<FollowResult> {
    const decision = this.deps.limiter.request(window, id);
    if (decision === 'too-fast') return refused('rate-limited');
    if (decision === 'blocked') return refused('blocked');
    if (decision === 'confirm') {
      if (this.confirming.has(id)) return refused('rate-limited');
      this.confirming.add(id);
      let allowed: boolean;
      try {
        allowed = await this.deps.confirmBurst(window);
      } finally {
        this.confirming.delete(id);
      }
      if (!allowed) {
        this.deps.limiter.block(id);
        return refused('blocked');
      }
      this.deps.limiter.allow(window, id);
    }
    try {
      await this.deps.shell.openExternal(url);
    } catch {
      // No browser or mail client took it; the page says so rather than failing the request.
      return refused('open-failed');
    }
    return { kind: 'external' };
  }

  private step(id: string, window: number, move: (records: TabRegistry) => HistoryEntry | null): HistoryResult {
    const before = this.deps.records.get(id, window)?.path;
    const entry = move(this.deps.records);
    if (!entry) return { kind: 'none' };
    const position = entry.position ?? null;
    if (entry.path === before) return { kind: 'anchor', anchor: entry.anchor ?? '', position };
    return { kind: 'navigated', anchor: entry.anchor, position };
  }

  /** The document's record and references, as main read it; null if main hasn't read it. */
  private async references(
    id: string,
    window: number,
  ): Promise<{ record: { path: string }; references: References } | null | 'unavailable'> {
    const record = this.deps.records.get(id, window);
    const read = this.reads.get(id);
    if (!record || !read || read.path !== record.path) return null;
    const references = await (read.references ??= this.extract(read));
    if (!references) {
      delete read.references;
      return 'unavailable';
    }
    return { record, references };
  }

  private async extract(read: Read): Promise<References | null> {
    const result = await this.deps.tasks.run<References>('references', read.text, { timeoutMs: REFERENCES_TIMEOUT_MS });
    return result.ok ? result.value : null;
  }
}

function refused(reason: Extract<FollowResult, { kind: 'refused' }>['reason']): FollowResult {
  return { kind: 'refused', reason };
}
