import type { Utf8 } from '../../core/settings/config-file';

const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();

export const utf8: Utf8 = {
  decode: (bytes) => decoder.decode(bytes),
  encode: (text) => encoder.encode(text),
};
