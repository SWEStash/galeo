import type { DocumentRecord } from '../../shared/documents';

/** A place in a tab's history: a file, and where in it (an anchor, or the top). */
export interface HistoryEntry {
  path: string;
  anchor: string | null;
}

interface Stored {
  id: string;
  window: number;
  entries: HistoryEntry[];
  index: number;
}

/**
 * The documents open in each window, as main knows them. Reads go through a record, so a window
 * can only read what was opened for it. Each record keeps its own back/forward history. Tabs grow
 * out of this (ADR-002's tab registry).
 */
export class DocumentRecords {
  private readonly records = new Map<string, Stored>();

  constructor(private readonly randomId: () => string) {}

  open(path: string, window: number): DocumentRecord {
    let id = this.randomId();
    while (this.records.has(id)) id = this.randomId();
    this.records.set(id, { id, window, entries: [{ path, anchor: null }], index: 0 });
    return { id, path };
  }

  get(id: string, window: number): DocumentRecord | undefined {
    const record = this.owned(id, window);
    return record && { id: record.id, path: record.entries[record.index]!.path };
  }

  list(window: number): DocumentRecord[] {
    return [...this.records.values()]
      .filter((record) => record.window === window)
      .map((record) => ({ id: record.id, path: record.entries[record.index]!.path }));
  }

  /** Moves the document to `entry`, dropping any forward history. */
  navigate(id: string, window: number, entry: HistoryEntry): boolean {
    const record = this.owned(id, window);
    if (!record) return false;
    record.entries = [...record.entries.slice(0, record.index + 1), entry];
    record.index = record.entries.length - 1;
    return true;
  }

  back(id: string, window: number): HistoryEntry | null {
    return this.move(id, window, -1);
  }

  forward(id: string, window: number): HistoryEntry | null {
    return this.move(id, window, 1);
  }

  closeWindow(window: number): void {
    for (const [id, record] of this.records) if (record.window === window) this.records.delete(id);
  }

  private move(id: string, window: number, step: -1 | 1): HistoryEntry | null {
    const record = this.owned(id, window);
    const target = record && record.entries[record.index + step];
    if (!record || !target) return null;
    record.index += step;
    return { ...target };
  }

  private owned(id: string, window: number): Stored | undefined {
    const record = this.records.get(id);
    return record && record.window === window ? record : undefined;
  }
}
