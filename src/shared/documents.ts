import type { FormatId, ViewMode } from './formats';
import type { ScrollAnchor } from './tabs';

/** Larger files aren't read at all (the too-large state); logs of 100 MB+ still open. A save's text has the same cap. */
export const READ_MAX_BYTES = 256 * 1024 * 1024;

export type TextEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'utf-32le' | 'utf-32be' | 'windows-1252';

/** A document open in a window. The renderer names it by `id` only (SR-12). */
export interface DocumentRecord {
  id: string;
  /** Empty for the settings tab. */
  path: string;
  /** Set on the window's settings tab (UX: a special tab); every other tab shows a file. */
  kind?: 'settings';
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
      /** The content hash of the bytes read: a save names it, and main refuses if the file moved on (ADR-013). */
      version: string;
    }
  | { state: 'empty'; path: string; format: FormatId }
  | { state: 'binary'; path: string; size: number }
  | { state: 'too-large'; path: string; maxBytes: number }
  | { state: 'missing' | 'no-permission' | 'not-a-file' | 'unreadable'; path: string };

/**
 * What a save did (ADR-013). `conflict`: the file is no longer the version the page loaded (null:
 * it's gone), and nothing was written. `refused`: the tab isn't in edit mode, or no input of the
 * reader's asked for it.
 */
export type SaveResult =
  | { kind: 'saved'; version: string }
  | { kind: 'conflict'; version: string | null }
  | { kind: 'unencodable'; character: string; line: number }
  | { kind: 'failed'; reason: 'no-permission' | 'not-a-file' | 'unavailable' }
  | { kind: 'refused'; reason: 'not-editable' | 'no-input' };

/** Why a link wasn't followed; the page shows it in the status bar. */
export type RefusalReason =
  | 'not-in-document'
  | 'no-input'
  | 'scheme'
  | 'host'
  | 'malformed'
  | 'rate-limited'
  | 'blocked'
  | 'unavailable'
  | 'open-failed';

/**
 * What following a link did. After `navigated`, the page reads the document again; `opened` put it
 * in a new tab behind this one.
 */
export type FollowResult =
  | { kind: 'navigated'; anchor: string | null }
  | { kind: 'opened' }
  | { kind: 'anchor'; anchor: string }
  | { kind: 'external' }
  | { kind: 'refused'; reason: RefusalReason };

/** What a step back or forward in a tab's history did; `position` is where the reader last was there. */
export type HistoryResult =
  | { kind: 'navigated'; anchor: string | null; position: ScrollAnchor | null }
  | { kind: 'anchor'; anchor: string; position: ScrollAnchor | null }
  | { kind: 'none' };

/** A local image the page may show: an opaque `galeo://file/…` URL, or why not. */
export type ImageResult =
  | { kind: 'image'; url: string }
  | { kind: 'refused'; reason: 'not-in-document' | 'missing' | 'not-an-image' | 'too-large' | 'unavailable' };
