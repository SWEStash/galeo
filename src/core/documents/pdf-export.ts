import type { FileSystem } from '../ports';

/** How long the page has, after the reader picked a file, to print into it. */
const TOKEN_MS = 60_000;

interface PdfExportDeps {
  /** Writes as a document save does (SR-15): an existing file keeps its mode, owner and links. */
  fs: Pick<FileSystem, 'saveFile'>;
  /** Main's own save dialog over the window: the path the reader picked, or null when cancelled. */
  askPath: (window: number, suggested: string) => Promise<string | null>;
  /** Prints the window's page (its print stylesheet shows only the document) to PDF bytes. */
  print: (window: number) => Promise<Uint8Array>;
  /** Real input per window: an export spends one (ADR-004). */
  input: { spend(window: number): boolean };
  randomId: () => string;
  now: () => number;
}

/**
 * Export to PDF (#56), in two steps so the page never names a path: `choose` asks the reader where,
 * in main's own dialog, and hands the page a one-use token for that file; the page readies its print
 * copy, then `print` prints the window into the file the token stands for.
 */
export class PdfExports {
  private readonly pending = new Map<string, { window: number; path: string; at: number }>();

  constructor(private readonly deps: PdfExportDeps) {}

  /** A token for the file the reader picks, or null (no input, or cancelled). */
  async choose(window: number, fileName: string): Promise<string | null> {
    if (!this.deps.input.spend(window)) return null;
    const path = await this.deps.askPath(window, pdfName(fileName));
    if (!path) return null;
    for (const [token, each] of this.pending) if (each.window === window) this.pending.delete(token);
    const token = this.deps.randomId();
    this.pending.set(token, { window, path, at: this.deps.now() });
    return token;
  }

  async print(window: number, token: string): Promise<'saved' | 'refused' | 'failed'> {
    const chosen = this.pending.get(token);
    if (!chosen || chosen.window !== window) return 'refused';
    this.pending.delete(token);
    if (this.deps.now() - chosen.at > TOKEN_MS) return 'refused';
    try {
      await this.deps.fs.saveFile(chosen.path, await this.deps.print(window));
      return 'saved';
    } catch {
      return 'failed';
    }
  }

  closeWindow(window: number): void {
    for (const [token, each] of this.pending) if (each.window === window) this.pending.delete(token);
  }
}

/** `notes.md` → `notes.pdf`: the file's name with its extension swapped. */
export function pdfName(fileName: string): string {
  const base = fileName.replace(/\.[^./\\]*$/, '') || 'document';
  return `${base}.pdf`;
}
