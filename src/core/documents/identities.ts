import type { FileSystem } from '../ports';
import type { Target } from '../text/encode';

/**
 * What file each tab's last read saw (ADR-002 file identity: inode, size, mtime), so a warm tab
 * shown again can tell whether its file changed meanwhile and must be read again. It also keeps the
 * shape of the last text read (encoding, byte order mark, line endings; never the text), so a file
 * deleted while edited is written back as it was.
 */
export class ReadIdentities {
  private readonly reads = new Map<string, { path: string; identity: string }>();
  private readonly shapes = new Map<string, { path: string; shape: Target }>();

  constructor(private readonly fs: FileSystem) {}

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
