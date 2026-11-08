import type { FileSystem } from '../ports';
import type { Target } from '../text/encode';
import { SentCopies, type SentCopy } from './incremental';

/**
 * What file each tab's last read saw (ADR-002 file identity: inode, size, mtime), so a warm tab
 * shown again can tell whether its file changed meanwhile and must be read again. It also keeps the
 * shape of the last text read (encoding, byte order mark, line endings; never the text), so a file
 * deleted while edited is written back as it was. For large files it keeps a copy of the bytes it last sent
 * the tab, so a re-read can send only what was added (ADR-033).
 */
export class ReadIdentities {
  private readonly reads = new Map<string, { path: string; identity: string }>();
  private readonly shapes = new Map<string, { path: string; shape: Target }>();

  private readonly copies: SentCopies;
  /** The file and encoding each tab's copy was read from: a copy counts only for the same source. */
  private readonly sources = new Map<string, string>();

  constructor(
    private readonly fs: FileSystem,
    limits = { minBytes: 1024 * 1024, maxTotalBytes: 512 * 1024 * 1024 },
  ) {
    this.copies = new SentCopies(limits);
  }

  /** What main sent tab `id` from `source` (its path and encoding), or null: nothing to keep. */
  sent(id: string, source: string, copy: SentCopy | null): void {
    if (copy) {
      this.copies.keep(id, copy);
      this.sources.set(id, source);
    } else {
      this.copies.forget(id);
      this.sources.delete(id);
    }
  }

  sentCopy(id: string, source: string): SentCopy | null {
    return this.sources.get(id) === source ? this.copies.get(id) : null;
  }

  async remember(id: string, path: string): Promise<void> {
    this.reads.set(id, { path, identity: await this.identity(path) });
  }

  /** False for a tab never read (or forgotten): there is nothing to compare. */
  async changed(id: string, path: string): Promise<boolean> {
    const read = this.reads.get(id);
    if (!read) return false;
    return read.path !== path || read.identity !== (await this.identity(path));
  }

  saw(id: string, path: string, shape: Target): void {
    this.shapes.set(id, { path, shape });
  }

  shapeOf(id: string, path: string): Target | null {
    const seen = this.shapes.get(id);
    return seen?.path === path ? seen.shape : null;
  }

  forget(id: string): void {
    this.reads.delete(id);
    this.shapes.delete(id);
    this.sent(id, '', null);
  }

  private async identity(path: string): Promise<string> {
    try {
      const stat = await this.fs.stat(path);
      return `${stat.id}:${stat.size}:${stat.mtimeMs}`;
    } catch {
      return 'missing';
    }
  }
}
