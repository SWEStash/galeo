import type { FileSystem } from '../ports';

export type DiagramFormat = 'svg' | 'png';
type DiagramSaveResult = 'saved' | 'cancelled' | 'refused' | 'failed';

/** The most a saved diagram may weigh (a rasterised PNG at twice the size is well under this). */
export const DIAGRAM_MAX_BYTES = 20 * 1024 * 1024;

interface DiagramSaveDeps {
  fs: Pick<FileSystem, 'writeFileAtomic'>;
  /** Main's own save dialog over the window: the path the reader picked, or null when cancelled. */
  askPath: (window: number, suggested: string, format: DiagramFormat) => Promise<string | null>;
  /** Real input per window: a save spends one (ADR-004). */
  input: { spend(window: number): boolean };
  encode: (text: string) => Uint8Array;
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
 * Saves a diagram the viewer shows (#59): the SVG galeo drew, or a PNG the page drew from it. Main
 * asks where, in a dialog the page can't answer, and writes only the path the reader picked.
 */
export class DiagramSaves {
  constructor(private readonly deps: DiagramSaveDeps) {}

  async save(window: number, format: DiagramFormat, data: string | Uint8Array, name: string): Promise<DiagramSaveResult> {
    const bytes = typeof data === 'string' ? this.deps.encode(data) : data;
    const fits = format === 'svg' ? typeof data === 'string' : data instanceof Uint8Array;
    if (!fits || bytes.byteLength === 0 || bytes.byteLength > DIAGRAM_MAX_BYTES || !this.deps.input.spend(window)) return 'refused';
    const target = await this.deps.askPath(window, diagramFileName(name, format), format);
    if (!target) return 'cancelled';
    try {
      await this.deps.fs.writeFileAtomic(target, bytes, { mode: 0o644 });
      return 'saved';
    } catch {
      return 'failed';
    }
  }
}
