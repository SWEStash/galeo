import type { Command } from '../shared/keymap';
import type { SettingsNotice } from '../shared/settings';

/**
 * What unpackaged test runs read from, or set in, main's global scope (Playwright's
 * `electronApp.evaluate`). Main writes them only when `app.isPackaged` is false.
 */
interface TestHooks {
  /** Tabs the page reported rendering, by path. */
  __galeoRenderingSeen?: string[];
  /** A path whose rendering kills the page, to test crash recovery. */
  __galeoCrashOnRendering?: string;
  /** Windows that asked for attention, by page id. */
  __galeoAttention?: number[];
  __galeoSettingsNotices?: readonly SettingsNotice[];
  __galeoCapabilityKeys?: Command[];
  __galeoEditAsked?: string[];
  __galeoOpenedExternal?: string[];
  __galeoRevealed?: string[];
  __galeoOpenedPaths?: string[];
  __galeoBlockedRequests?: string[];
}

export const testHooks = globalThis as TestHooks;
