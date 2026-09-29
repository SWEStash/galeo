import type { BrowserWindow } from 'electron';
import path from 'node:path';
import type { Clock, FileSystem, FileWatcher } from '../../core/ports';
import { SessionKeeper } from '../../core/session/keeper';
import { RecentFiles } from '../../core/session/recent';
import { SessionStore } from '../../core/session/store';
import type { Utf8 } from '../../core/settings/json-file';
import { ProfileSettings } from '../../core/settings/profile-settings';
import type { TabRegistry } from '../../core/tabs/registry';
import type { AppPaths } from '../../core/ports';
import { parseRecentFiles, parseSession } from '../session/schemas';
import { parseGlobalSettings, parseProfileFile } from '../settings/schemas';
import { windowBounds } from '../window/factory';

export interface RuntimeDeps {
  fs: FileSystem;
  utf8: Utf8;
  watcher: FileWatcher;
  clock: Clock;
  paths: AppPaths;
  tabs: TabRegistry;
  /** Window ids, the last focused first, across all profiles. */
  focusOrder: () => readonly number[];
}

/**
 * A running profile (ADR-005): its settings, session and recent files, and its windows in the
 * order they opened. It runs while it has a window; the last one closing saves and stops it.
 */
export class ProfileRuntime {
  readonly settings: ProfileSettings;
  readonly sessions: SessionStore;
  readonly recent: RecentFiles;
  readonly keeper: SessionKeeper;
  readonly windows: BrowserWindow[] = [];
  /** Set when the profile is going away unsaved (Undo of a profile `--profile` created). */
  discard = false;

  constructor(
    readonly id: string,
    deps: RuntimeDeps,
  ) {
    const { fs, utf8, paths } = deps;
    this.settings = new ProfileSettings({
      fs,
      utf8,
      watcher: deps.watcher,
      configDir: paths.configDir,
      profile: id,
      parseGlobal: parseGlobalSettings,
      parseProfile: parseProfileFile,
    });
    const state = path.join(paths.stateDir, 'profiles', id);
    this.sessions = new SessionStore({ fs, utf8, dir: state, parse: parseSession });
    this.recent = new RecentFiles({ fs, utf8, path: path.join(state, 'recent.json'), parse: parseRecentFiles, now: Date.now });
    this.keeper = new SessionKeeper({
      tabs: deps.tabs,
      clock: deps.clock,
      save: (session) => this.sessions.save(session).catch((error: unknown) => console.warn(`galeo: session of ${id} not saved`, error)),
      windows: () => this.windows.map((window) => ({ id: window.webContents.id, bounds: windowBounds(window) })),
      focusOrder: deps.focusOrder,
      // Nothing is saved before the session is restored and its windows are open.
      running: false,
    });
  }

  has(windowId: number): boolean {
    return this.windows.some((window) => window.webContents.id === windowId);
  }

  /** Saves what the profile holds (unless discarded) and stops watching its files. */
  async stop(): Promise<void> {
    // A discarded profile's pending save must not write its folder back after it is deleted.
    if (this.discard) this.keeper.holdForQuit();
    else await this.keeper.flushOnQuit();
    this.settings.stop();
  }
}
