import type { DocumentRecord } from '../../shared/documents';

/**
 * The documents open in each window, as main knows them. Reads go through a record, so a window
 * can only read what was opened for it. Tabs grow out of this (ADR-002's tab registry).
 */
export class DocumentRecords {
  private readonly records = new Map<string, DocumentRecord & { window: number }>();

  constructor(private readonly randomId: () => string) {}

  open(path: string, window: number): DocumentRecord {
    let id = this.randomId();
    while (this.records.has(id)) id = this.randomId();
    this.records.set(id, { id, path, window });
    return { id, path };
  }

  get(id: string, window: number): DocumentRecord | undefined {
    const record = this.records.get(id);
    return record && record.window === window ? { id: record.id, path: record.path } : undefined;
  }

  list(window: number): DocumentRecord[] {
    return [...this.records.values()].filter((record) => record.window === window).map(({ id, path }) => ({ id, path }));
  }

  closeWindow(window: number): void {
    for (const [id, record] of this.records) if (record.window === window) this.records.delete(id);
  }
}
