import type { FollowResult, HistoryResult } from '../../shared/documents';
import type { References } from '../../shared/markdown/references';
import { classifyLink, type LinkContext } from '../links/classify';
import type { ExternalOpenLimiter } from '../links/limiter';
import type { OsShell, TaskRunner } from '../ports';
import type { DocumentRecords, HistoryEntry } from './records';

/** Extraction runs in a worker thread; hostile Markdown gets this long before it's abandoned. */
export const REFERENCES_TIMEOUT_MS = 2000;

export interface DocumentLinksDeps extends Omit<LinkContext, 'documentPath'> {
  records: DocumentRecords;
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

  constructor(private readonly deps: DocumentLinksDeps) {}

  /** The text main just read for a document: its links are the only ones that can be followed. */
  remember(id: string, window: number, text: string): void {
    const record = this.deps.records.get(id, window);
    if (record) this.reads.set(id, { path: record.path, text });
  }

  async follow(id: string, window: number, href: string): Promise<FollowResult> {
    const record = this.deps.records.get(id, window);
    const read = this.reads.get(id);
    if (!record || !read || read.path !== record.path) return refused('not-in-document');
    const references = await (read.references ??= this.extract(read));
    if (!references) {
      delete read.references;
      return refused('unavailable');
    }
    if (!references.links.includes(href)) return refused('not-in-document');

    const target = classifyLink(href, { ...this.deps, documentPath: record.path });
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
      if (!(await this.deps.confirmBurst(window))) {
        this.deps.limiter.block(id);
        return refused('blocked');
      }
      this.deps.limiter.allow(window, id);
    }
    await this.deps.shell.openExternal(url);
    return { kind: 'external' };
  }

  private step(id: string, window: number, move: (records: DocumentRecords) => HistoryEntry | null): HistoryResult {
    const before = this.deps.records.get(id, window)?.path;
    const entry = move(this.deps.records);
    if (!entry) return { kind: 'none' };
    if (entry.path === before) return { kind: 'anchor', anchor: entry.anchor ?? '' };
    return { kind: 'navigated', anchor: entry.anchor };
  }

  private async extract(read: Read): Promise<References | null> {
    const result = await this.deps.tasks.run<References>('references', read.text, { timeoutMs: REFERENCES_TIMEOUT_MS });
    return result.ok ? result.value : null;
  }
}

function refused(reason: Extract<FollowResult, { kind: 'refused' }>['reason']): FollowResult {
  return { kind: 'refused', reason };
}
