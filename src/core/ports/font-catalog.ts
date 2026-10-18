import type { SystemFont } from '../../shared/fonts';

/** The font families installed on the system; an empty list where they can't be listed. Never throws. */
export interface FontCatalog {
  list(): Promise<SystemFont[]>;
}
