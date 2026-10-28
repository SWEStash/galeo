import { READ_MAX_BYTES } from '../../shared/documents';
import { FIND_ALL_MIN_CHARACTERS, type FindAllResult, type FindAllSkip, type FindAllTab, type FindInTextResult } from '../../shared/find';
import { FsError, type FileSystem, type TaskRunner } from '../ports';
import type { TabRegistry } from '../tabs/registry';
import { decodeText, type Decode } from '../text/decode';
import type { EditGrants } from './edit-grants';
import { STATE_BY_CODE } from './read';

/** One tab's search; past it the worker is replaced and the tab is "too slow" (SR-14). */
const FIND_ALL_TAB_BUDGET_MS = 5000;

/**
 * Searches a window's tabs for a query (ADR-024): main reads each tab's text, or takes its kept
 * unsaved text, and the task worker matches it, one tab at a time. A newer query from the same
 * window stops the older search before its next tab, and starts only once the older one has
 * stopped: a window never has more than one file read in flight, however many queries it sends.
 */
export class TabSearches {
  private readonly latest = new Map<number, number>();
  /** Each window's last search, which the next one waits for. */
  private readonly running = new Map<number, Promise<unknown>>();

  constructor(
    private readonly deps: {
      records: TabRegistry;
      grants: EditGrants;
      fs: FileSystem;
      decode: Decode;
      tasks: TaskRunner;
    },
  ) {}

  async search(window: number, query: string, { caseSensitive }: { caseSensitive: boolean }): Promise<FindAllResult> {
    const search = (this.latest.get(window) ?? 0) + 1;
    this.latest.set(window, search);
    if ([...query].length < FIND_ALL_MIN_CHARACTERS) return { kind: 'done', tabs: [] };
    const previous = this.running.get(window);
    const current = (async () => {
      await previous;
      return this.searchTabs(window, search, query, caseSensitive);
    })();
    this.running.set(window, current);
    return current;
  }

  closeWindow(window: number): void {
    this.latest.delete(window);
    this.running.delete(window);
  }

  private async searchTabs(window: number, search: number, query: string, caseSensitive: boolean): Promise<FindAllResult> {
    const tabs: FindAllTab[] = [];
    const superseded = () => this.latest.get(window) !== search;
    for (const record of this.deps.records.list(window)) {
      if (record.kind === 'settings') continue;
      if (superseded()) return { kind: 'superseded' };
      const text = await this.textOf(record.id, record.path, window);
      if (superseded()) return { kind: 'superseded' };
      if (typeof text !== 'string') {
        tabs.push({ id: record.id, skipped: text.skipped });
        continue;
      }
      const result = await this.deps.tasks.run<FindInTextResult>('findInText', { text, query, caseSensitive }, { timeoutMs: FIND_ALL_TAB_BUDGET_MS });
      if (superseded()) return { kind: 'superseded' };
      if (!result.ok) tabs.push({ id: record.id, skipped: result.reason === 'timeout' ? 'too-slow' : 'unreadable' });
      else if (result.value.count > 0) tabs.push({ id: record.id, found: result.value });
    }
    return { kind: 'done', tabs };
  }

  /** The tab's unsaved text if main keeps one, else its file's text as the tab reads it. */
  private async textOf(id: string, path: string, window: number): Promise<string | { skipped: FindAllSkip }> {
    const kept = this.deps.grants.kept(id, window);
    if (kept) return kept.text;
    let bytes: Uint8Array;
    try {
      bytes = await this.deps.fs.readFile(path, { maxBytes: READ_MAX_BYTES });
    } catch (error) {
      if (!(error instanceof FsError)) throw error;
      return { skipped: error.code === 'ETOOBIG' ? 'too-large' : STATE_BY_CODE[error.code] };
    }
    const decoded = decodeText(bytes, this.deps.decode, this.deps.records.encoding(id, window) ?? undefined);
    return decoded.kind === 'binary' ? { skipped: 'binary' } : decoded.text;
  }
}
