import type { BrowserWindow } from 'electron';
import path from 'node:path';
import type { AppPaths, Clock, FileSystem, FileWatcher } from '../../core/ports';
import { SessionKeeper } from '../../core/session/keeper';
import { RecentFiles } from '../../core/session/recent';
import { SessionStore } from '../../core/session/store';
import type { Utf8 } from '../../core/settings/json-file';
import { ProfileSettings } from '../../core/settings/profile-settings';
import type { WindowBounds } from '../../core/session/model';
import type { SettingsNotice } from '../../shared/settings';
import type { TabRegistry, WindowState } from '../../core/tabs/registry';
import { parseRecentFiles, parseSession } from '../session/schemas';
import { parseGlobalSettings, parseProfileFile } from '../settings/schemas';
import { windowBounds } from '../window/factory';

const CLOSED_WINDOWS = 10;

interface RuntimeDeps {
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
  /** Windows closed while others stayed open, newest last, until the profile stops (UX F5: Ctrl+Shift+T). */
  readonly closedWindows: { state: WindowState; bounds: WindowBounds; at: number }[] = [];
  /** Its session file was invalid at start and a snapshot was restored instead (SR-17), for the window to say. */
  sessionNotice: SettingsNotice | null = null;
  /** Set when the profile is going away unsaved (Undo of a profile `--profile` created). */
  discard = false;

  constructor(
    readonly id: string,
    /** The display name, for window titles and the profile chip. */
    public name: string,
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

  /** Keeps a closing window's tabs for Ctrl+Shift+T; at most 10 windows. */
  keepClosed(closed: { state: WindowState; bounds: WindowBounds; at: number }): void {
    this.closedWindows.push(closed);
    if (this.closedWindows.length > CLOSED_WINDOWS) this.closedWindows.shift();
  }

  has(windowId: number): boolean {
    return this.window(windowId) !== undefined;
  }

  /** Its window with this page id. */
  window(windowId: number): BrowserWindow | undefined {
    return this.windows.find((window) => window.webContents.id === windowId);
  }

  /** Saves what the profile holds (unless discarded), stops watching its files, and waits for its writes. */
  async stop(): Promise<void> {
    // A discarded profile's pending save must not write its folder back after it is deleted.
    if (this.discard) this.keeper.holdForQuit();
    else await this.keeper.flushOnQuit();
    this.settings.stop();
    // Writes already under way land before anyone deletes, restarts or quits past this profile.
    await Promise.all([this.sessions.idle(), this.recent.idle()]);
  }
}
