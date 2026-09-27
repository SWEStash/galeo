import type { FormatId, ViewMode } from './formats';

export type TextEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'utf-32le' | 'utf-32be' | 'windows-1252';

/** A document open in a window. The renderer names it by `id` only (SR-12). */
export interface DocumentRecord {
  id: string;
  path: string;
}

/** A document's text and how to show it, or the state to show instead (UX §4). */
export type DocumentContent =
  | {
      state: 'ready';
      path: string;
      format: FormatId;
      view: ViewMode;
      banner: 'too-large' | null;
      text: string;
      encoding: TextEncoding;
      /** Not valid UTF-8 and no byte order mark: the encoding banner names the guess. */
      guessedEncoding: boolean;
      size: number;
    }
  | { state: 'empty'; path: string; format: FormatId }
  | { state: 'binary'; path: string; size: number }
  | { state: 'too-large'; path: string; maxBytes: number }
  | { state: 'missing' | 'no-permission' | 'not-a-file' | 'unreadable'; path: string };
