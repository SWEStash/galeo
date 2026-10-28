import type { FontCatalog } from '../../core/ports';
import { FC_LIST_FORMAT, parseFontList } from '../../core/fonts/fc-list';
import type { SystemFont } from '../../shared/fonts';
import { runFile, type RunFile } from './run-file';

/** fc-list gets this long, and this much output (the owner's 250 families are about 10 KB). */
const TIMEOUT_MS = 5000;
const MAX_OUTPUT = 4 * 1024 * 1024;
/** How long a failure stands before fc-list runs again. */
const RETRY_AFTER_MS = 60_000;

/**
 * The installed families as fontconfig lists them (Linux). fc-list runs with fixed arguments and
 * nothing from the page: a list is kept for the app's life; a failure (no fontconfig, a timeout,
 * too much output) is logged, lists nothing, and stands for a minute before fc-list runs again.
 */
export class FcListFontCatalog implements FontCatalog {
  private listed: Promise<SystemFont[]> | null = null;
  private failedAt = 0;

  constructor(
    private readonly run: RunFile = runFile,
    private readonly now: () => number = Date.now,
  ) {}

  list(): Promise<SystemFont[]> {
    if (this.failedAt && this.now() - this.failedAt >= RETRY_AFTER_MS) {
      this.listed = null;
      this.failedAt = 0;
    }
    this.listed ??= this.run('fc-list', ['-f', FC_LIST_FORMAT], { timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT }).then(
      parseFontList,
      (error: unknown) => {
        this.failedAt = this.now();
        console.warn('galeo: listing the system fonts failed; trying again in a minute', error);
        return [];
      },
    );
    return this.listed;
  }
}

/** Where galeo doesn't list system fonts (macOS, Windows): the pickers offer the bundled ones. */
export class EmptyFontCatalog implements FontCatalog {
  async list(): Promise<SystemFont[]> {
    return [];
  }
}
