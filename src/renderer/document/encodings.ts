import type { TextEncoding } from '../../shared/documents';

/** How encodings are named to readers. */
export const ENCODING_NAMES: Record<TextEncoding, string> = {
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16LE',
  'utf-16be': 'UTF-16BE',
  'utf-32le': 'UTF-32LE',
  'utf-32be': 'UTF-32BE',
  'windows-1252': 'Windows-1252',
};
