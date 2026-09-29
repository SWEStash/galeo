// The IPC contract between main and the renderer (ADR-007, SR-11). Only names and types live
// here: main validates every request with its own schemas, and the preload builds
// `window.galeo` from `CHANNELS` and `EVENTS`, one fixed method per channel or event.
import type { DocumentContent, DocumentRecord, FollowResult, HistoryResult, ImageResult } from '../documents';
import type { Platform } from '../keymap';
import type { Settings, SettingSource, SettingsNotice, SettingsOverrides } from '../settings';
import type { ScrollAnchor, TabSnapshot } from '../tabs';

export type { DocumentContent, DocumentRecord, FollowResult, HistoryResult, ImageResult, ScrollAnchor, TabSnapshot };

/** The window's resolved settings, and the config files it couldn't use (SR-17). */
export interface SettingsState {
  settings: Settings;
  notices: SettingsNotice[];
  /** The profile's session file was invalid; it was set aside and the newest valid snapshot restored (SR-17). */
  session: SettingsNotice | null;
  /** The user's CSS for documents: the global `custom.css`, then the profile's (ADR-005). */
  css: { global: string; profile: string };
  /** What every profile gets (defaults, then `settings.json`), and where each resolved value comes from. */
  shared: Settings;
  sources: Record<keyof Settings, SettingSource>;
}

/** Where a Settings tab change goes: all profiles (`settings.json`) or this one (`profile.json`). */
export type SettingsScope = 'global' | 'profile';
/** A change was written, or its file holds an invalid hand edit and was left untouched (SR-17). */
export type SettingsResult = { ok: true } | { ok: false; path: string };

/** A profile as the profile menu shows it; `running` while it has a window (ADR-005). */
export interface ProfileView {
  id: string;
  name: string;
  accent: string | null;
  running: boolean;
}

/** The profiles, and which one the window belongs to. */
export interface ProfilesState {
  current: string;
  profiles: ProfileView[];
}

/** Why a profile name was refused, or why the profile's file couldn't be changed (left untouched, SR-17). */
export type ProfileRefusal = 'empty' | 'too-long' | 'control-character' | 'taken' | 'invalid-file';
export type ProfileResult = { ok: true } | { ok: false; reason: ProfileRefusal };

/** A previous session of the profile, as "Restore previous session" lists it. */
export interface PreviousSession {
  snapshot: number;
  savedAt: number;
  windows: number;
  tabs: number;
}

/** The encodings "Reopen with encoding…" offers. */
export const CHOSEN_ENCODINGS = ['utf-8', 'utf-16le', 'utf-16be', 'windows-1252'] as const;
export type ChosenEncoding = (typeof CHOSEN_ENCODINGS)[number];

/** Where a followed link opens: in its own tab, or in a new tab behind it (Ctrl/middle-click). */
export type LinkTarget = 'current' | 'background';

/** Why Chromium's sandbox couldn't start, as detected by the Linux launcher wrapper (ADR-009). */
export type SandboxCause = 'apparmor-userns' | 'suid-helper' | 'unknown';

export type SandboxChoice = 'quit' | 'run-unsandboxed';

export interface AppInfo {
  name: string;
  version: string;
  platform: Platform;
  sandboxed: boolean;
  /** Set while the app shows only the sandbox-unavailable choice (ADR-009). */
  sandboxUnavailable: SandboxCause | null;
  /** Running as an AppImage, which can install its own command-line launcher (ADR-008). */
  appImage: boolean;
}

/** Renderer → main request/response channels, named `<group>.<method>`. */
export const CHANNELS = [
  'app.info',
  'app.resolveSandboxUnavailable',
  'app.installLauncher',
  'documents.read',
  'documents.setEncoding',
  'documents.followLink',
  'documents.back',
  'documents.forward',
  'documents.resolveImage',
  'documents.pathMenu',
  'documents.contextMenu',
  'tabs.snapshot',
  'tabs.activated',
  'tabs.rendered',
  'tabs.position',
  'tabs.zoom',
  'tabs.close',
  'tabs.reopenClosed',
  'tabs.move',
  'settings.get',
  'session.previous',
  'session.restorePrevious',
  'recent.list',
  'recent.open',
  'recent.clear',
  'profiles.created',
  'profiles.undoCreate',
  'profiles.list',
  'profiles.open',
  'profiles.create',
  'profiles.update',
  'profiles.delete',
  'settings.set',
  'settings.reset',
  'settings.openCustomCss',
  'settings.openNoticeFile',
  'tabs.openSettings',
] as const;

export type Channel = (typeof CHANNELS)[number];

/** Arguments of each channel, as a tuple. */
export interface Requests {
  'app.info': [];
  'app.resolveSandboxUnavailable': [choice: SandboxChoice];
  /** AppImage only: writes `~/.local/bin/galeo` and a desktop entry for this AppImage. */
  'app.installLauncher': [];
  /** Reads one of them by id; there is no way to read by path (SR-12). */
  'documents.read': [id: string];
  /** Reads the document with this encoding from now on ("Reopen with encoding…"); null detects it again. */
  'documents.setEncoding': [id: string, encoding: ChosenEncoding | null];
  /** Follows a link of the document, as written in it; main checks it against the file (SR-04). */
  'documents.followLink': [id: string, href: string, target: LinkTarget];
  'documents.back': [id: string];
  'documents.forward': [id: string];
  /** An image the document shows, as written in it; main answers with an opaque URL (ADR-004). */
  'documents.resolveImage': [id: string, src: string];
  /** Asks main for the native menu of the document's path (copy it, reveal it); main acts on the choice. */
  'documents.pathMenu': [id: string];
  /**
   * Asks main for the document's native menu (open with the default app, reveal, copy path). There
   * is no channel that opens a file: only the user's choice in main's menu does (SR-05).
   */
  'documents.contextMenu': [id: string];
  /** The sender's tabs, as main knows them. */
  'tabs.snapshot': [];
  /** The window already shows this tab; main records it (the window activates tabs itself, ADR-002). */
  'tabs.activated': [id: string];
  /** How much the tab's rendered content weighs (UTF-16 bytes of its HTML or text), for the warm budget. */
  'tabs.rendered': [id: string, weight: number];
  /** Where the reader is in the tab, reported after scrolling settles. */
  'tabs.position': [id: string, position: ScrollAnchor];
  /** The tab's zoom (1 is 100 %), kept by main for the session. */
  'tabs.zoom': [id: string, zoom: number];
  'tabs.close': [id: string];
  /** Brings back the window's most recently closed tab. */
  'tabs.reopenClosed': [];
  /** Moves a tab to `position` in the window's order. */
  'tabs.move': [id: string, position: number];
  'settings.get': [];
  /** The profile's previous sessions ("Restore previous session", UX F6). */
  'session.previous': [];
  /** Opens one of them again, in new windows. */
  'session.restorePrevious': [snapshot: number];
  /** The profile's most recent files, each under an id this window may open (never a path). */
  'recent.list': [];
  'recent.open': [id: string];
  'recent.clear': [];
  /** `--profile` created the sender's profile for it: the notice to show, with the token Undo takes (ADR-005). */
  'profiles.created': [];
  /** Undoes a profile `--profile` just created (by the token its notice carried): its files go where they would have without it. */
  'profiles.undoCreate': [token: string];
  'profiles.list': [];
  /** Switches to a profile: its last focused window if it runs, else it starts with its session. */
  'profiles.open': [id: string];
  /** Creates a profile and opens a window of it. */
  'profiles.create': [name: string, accent: string | null];
  /** Renames and recolours the sender's own profile. */
  'profiles.update': [name: string, accent: string | null];
  /** Deletes the sender's own profile: its windows close, its session and settings go (never `default`). */
  'profiles.delete': [];
  'settings.set': [scope: SettingsScope, change: SettingsOverrides];
  /** Drops this profile's own value of a setting ("Reset to global"). */
  'settings.reset': [key: keyof Settings];
  /** Opens the global or this profile's `custom.css` in the user's editor, creating it first. */
  'settings.openCustomCss': [scope: SettingsScope];
  /** Opens the file a settings notice names (by its place in the window's notices, never a path). */
  'settings.openNoticeFile': [index: number];
  /** Shows the window's settings tab (Ctrl+,), opening it if needed. */
  'tabs.openSettings': [];
}

/** Resolved value of each channel. */
export interface Responses {
  'app.info': AppInfo;
  'app.resolveSandboxUnavailable': void;
  /** Where `galeo` was written, or why it wasn't. */
  'app.installLauncher': { ok: true; bin: string } | { ok: false; reason: string };
  'documents.read': DocumentContent;
  'documents.setEncoding': void;
  'documents.followLink': FollowResult;
  'documents.back': HistoryResult;
  'documents.forward': HistoryResult;
  'documents.resolveImage': ImageResult;
  'documents.pathMenu': void;
  'documents.contextMenu': void;
  'tabs.snapshot': TabSnapshot;
  'tabs.activated': void;
  'tabs.rendered': void;
  'tabs.position': void;
  'tabs.zoom': void;
  'tabs.close': void;
  /** The reopened tab's id, or null when none was closed. */
  'tabs.reopenClosed': string | null;
  'tabs.move': void;
  'settings.get': SettingsState;
  'session.previous': PreviousSession[];
  'session.restorePrevious': void;
  'recent.list': { id: string; path: string }[];
  'recent.open': void;
  'recent.clear': void;
  'profiles.created': { name: string; token: string } | null;
  'profiles.undoCreate': void;
  'profiles.list': ProfilesState;
  'profiles.open': void;
  'profiles.create': ProfileResult;
  'profiles.update': ProfileResult;
  'profiles.delete': void;
  'settings.set': SettingsResult;
  'settings.reset': SettingsResult;
  'settings.openCustomCss': void;
  'settings.openNoticeFile': void;
  'tabs.openSettings': string;
}

/** Main → renderer events, named `<group>.<event>`; the page subscribes with `<group>.on<Event>`. */
export const EVENTS = ['tabs.changed', 'tabs.demote', 'tabs.stale', 'settings.changed', 'profiles.changed'] as const;

export type EventName = (typeof EVENTS)[number];

/** The payload of each event. */
export interface Events {
  /** The window's tabs changed; a snapshot with a higher revision replaces the one before. */
  'tabs.changed': TabSnapshot;
  /** Hibernate these tabs: drop their rendered content, keep their place (ADR-002). */
  'tabs.demote': string[];
  /** The tab's file changed since the read it shows; read it again. */
  'tabs.stale': string;
  'settings.changed': SettingsState;
  /** A profile was created, renamed, recoloured, deleted, started or stopped. */
  'profiles.changed': ProfilesState;
}

type Group<C extends string> = C extends `${infer G}.${string}` ? G : never;

/** The API the preload exposes as `window.galeo`. */
export type GaleoApi = {
  [G in Group<Channel | EventName>]: {
    [C in Channel as C extends `${G}.${infer M}` ? M : never]: (
      ...args: Requests[C]
    ) => Promise<Responses[C]>;
  } & {
    [E in EventName as E extends `${G}.${infer N}` ? `on${Capitalize<N>}` : never]: (
      listener: (payload: Events[E]) => void,
    ) => () => void;
  };
};
