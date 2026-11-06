import type { FileSystem } from '../ports';

export type DiagramFormat = 'svg' | 'png';

/** The most a saved diagram may weigh (a rasterised PNG at twice the size is well under this). */
export const DIAGRAM_MAX_BYTES = 20 * 1024 * 1024;

/** How long the page has, after the reader picked a file, to send the diagram for it. */
const TOKEN_MS = 60_000;

interface DiagramSaveDeps {
  /** Writes as a document save does (SR-15): an existing file keeps its mode, owner and links. */
  fs: Pick<FileSystem, 'saveFile'>;
  /** Main's own save dialog over the window: the path the reader picked, or null when cancelled. */
  askPath: (window: number, suggested: string, format: DiagramFormat) => Promise<string | null>;
  /** Real input per window: a save spends one (ADR-004). */
  input: { spend(window: number): boolean };
  encode: (text: string) => Uint8Array;
  randomId: () => string;
  now: () => number;
}

/** A file name from the diagram's name: no folders, no control characters, not too long. */
export function diagramFileName(name: string, format: DiagramFormat): string {
  const base = name
    .replace(/[\p{Cc}\\/:*?"<>|]+/gu, ' ')
    // `..` and `.` as words of their own are folder steps, not names.
    .replace(/(?<=^|\s)\.+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80)
    .trim();
  return `${base || 'diagram'}.${format}`;
}

/**
 * Saves a diagram the viewer shows (#59), in two steps: `choose` spends the click's input and asks
 * where, in main's own dialog the page can't answer, and hands the page a one-use token; `write`
 * takes the SVG galeo drew, or a PNG the page drew from it (which may take longer than an input
 * credit lasts), and writes it to that file as a document save writes (SR-15).
 */
export class DiagramSaves {
  private readonly pending = new Map<string, { window: number; path: string; format: DiagramFormat; at: number }>();

  constructor(private readonly deps: DiagramSaveDeps) {}

  /** A token for the file the reader picks, or null (no input, or cancelled). */
  async choose(window: number, format: DiagramFormat, name: string): Promise<string | null> {
    if (!this.deps.input.spend(window)) return null;
    const path = await this.deps.askPath(window, diagramFileName(name, format), format);
    if (!path) return null;
    for (const [token, each] of this.pending) if (each.window === window) this.pending.delete(token);
    const token = this.deps.randomId();
    this.pending.set(token, { window, path, format, at: this.deps.now() });
    return token;
  }

  async write(window: number, token: string, data: string | Uint8Array): Promise<'saved' | 'refused' | 'failed'> {
    const chosen = this.pending.get(token);
    if (!chosen || chosen.window !== window) return 'refused';
    this.pending.delete(token);
    const bytes = typeof data === 'string' ? this.deps.encode(data) : data;
    const fits = chosen.format === 'svg' ? typeof data === 'string' : data instanceof Uint8Array;
    if (!fits || bytes.byteLength === 0 || bytes.byteLength > DIAGRAM_MAX_BYTES || this.deps.now() - chosen.at > TOKEN_MS) return 'refused';
    try {
      await this.deps.fs.saveFile(chosen.path, bytes);
      return 'saved';
    } catch {
      return 'failed';
    }
  }

  closeWindow(window: number): void {
    for (const [token, each] of this.pending) if (each.window === window) this.pending.delete(token);
  }
}
