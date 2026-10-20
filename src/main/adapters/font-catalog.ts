import type { FontCatalog } from '../../core/ports';
import { FC_LIST_FORMAT, parseFontList } from '../../core/fonts/fc-list';
import type { SystemFont } from '../../shared/fonts';
import { runFile, type RunFile } from './run-file';

/** fc-list gets this long, and this much output (the owner's 250 families are about 10 KB). */
const TIMEOUT_MS = 5000;
const MAX_OUTPUT = 4 * 1024 * 1024;

/**
 * The installed families as fontconfig lists them (Linux). fc-list runs with fixed arguments and
 * nothing from the page, once: a list is kept for the app's life, a failure (no fontconfig, a
 * timeout, too much output) lists nothing and is asked again next time.
 */
export class FcListFontCatalog implements FontCatalog {
  private listed: Promise<SystemFont[]> | null = null;

  constructor(private readonly run: RunFile = runFile) {}

  list(): Promise<SystemFont[]> {
    this.listed ??= this.run('fc-list', ['-f', FC_LIST_FORMAT], { timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT }).then(parseFontList, () => {
      this.listed = null;
      return [];
    });
    return this.listed;
  }
}

/** Where galeo doesn't list system fonts (macOS, Windows): the pickers offer the bundled ones. */
export class EmptyFontCatalog implements FontCatalog {
  async list(): Promise<SystemFont[]> {
    return [];
  }
}
