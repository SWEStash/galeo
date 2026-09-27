import type { Decode } from '../../core/text/decode';

/** The platform's WHATWG decoder for core's `decodeText`; byte order marks are handled by core. */
export const decodeWithPlatform: Decode = (bytes, encoding, { fatal }) =>
  new TextDecoder(encoding, { fatal, ignoreBOM: true }).decode(bytes);
