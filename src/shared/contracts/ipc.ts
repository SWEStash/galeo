// The IPC contract between main and the renderer (ADR-007, SR-11). Only names and types live
// here: main validates every request with its own schemas, and the preload builds
// `window.galeo` from `CHANNELS` and `EVENTS`, one fixed method per channel or event.
import type { DocumentContent, DocumentRecord, FollowResult, HistoryResult, ImageResult, SaveResult } from '../documents';
import type { Platform, WindowCommand } from '../keymap';
import type { SystemFont } from '../fonts';
import type { Settings, SettingSource, SettingsNotice, SettingsOverrides } from '../settings';
import type { ReaderWidth, ScrollAnchor, TabSnapshot, TabViewState } from '../tabs';
import type { QuickOpenResults, QuickOpenStart } from '../quick-open';

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

/** Another window a tab can move to (ADR-019): its profile, and the file its shown tab has (null: none). */
export interface OtherWindow {
  window: number;
  profile: string;
  accent: string | null;
  shows: string | null;
}

/** What main holds for a tab a page shows anew (after a crash, or moved in): edit mode, and unsaved text. */
export interface Recovered {
  edit: boolean;
  kept: { text: string; base: string | null } | null;
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
  /** This window's renderer crashed repeatedly: it shows the crash-loop message, not its tabs (UX §4). */
  crashLoop: boolean;
}

/** What a page knows from its window's creation, before it can ask main anything: all but the crash loop. */
export type StartInfo = Omit<AppInfo, 'crashLoop'>;

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
  'documents.save',
  'documents.dirty',
  'documents.leaveEdit',
  'documents.closeAnswer',
  'documents.keep',
  'documents.recover',
  'tabs.snapshot',
  'tabs.activated',
  'tabs.rendering',
  'tabs.rendered',
  'tabs.renderAgain',
  'tabs.position',
  'tabs.zoom',
  'tabs.width',
  'tabs.viewState',
  'tabs.close',
  'tabs.reopenClosed',
  'tabs.move',
  'tabs.dragStart',
  'tabs.dragEnd',
  'tabs.adopt',
  'tabs.moveTo',
  'tabs.windows',
  'settings.get',
  'session.previous',
  'session.restorePrevious',
  'recent.list',
  'recent.open',
  'recent.clear',
  'drops.open',
  'quickOpen.start',
  'quickOpen.query',
  'quickOpen.open',
  'quickOpen.close',
  'profiles.created',
  'profiles.undoCreate',
  'profiles.list',
  'profiles.open',
  'profiles.create',
  'profiles.update',
  'profiles.delete',
  'settings.set',
  'settings.reset',
  'settings.fonts',
  'settings.openCustomCss',
  'settings.openNoticeFile',
  'tabs.openSettings',
  'window.command',
  'window.retryAfterCrashes',
] as const;

export type Channel = (typeof CHANNELS)[number];

/**
 * Channels only the preload calls, never part of `window.galeo`: what they carry comes from the
 * preload's isolated world, which page script can't reach (SR-12).
 */
export const PRELOAD_CHANNELS = ['drops.register'] as const;
export type PreloadChannel = (typeof PRELOAD_CHANNELS)[number];
/** Every channel main handles. */
export type AnyChannel = Channel | PreloadChannel;

/** Where dropped files go: after a tab (null: before every tab); without `after`, after the shown tab. */
export interface DropTarget {
  after?: string | null;
}

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
  /**
   * Writes the tab's edited text, if main put the tab in edit mode and the file is still the
   * version the page loaded (`base`, from its read or last save). A null `base` writes a file that
   * was gone, only if it's still gone. A reader's input pays for it (ADR-013).
   */
  'documents.save': [id: string, text: string, base: string | null];
  /** Whether the tab in edit mode has unsaved changes (close and quit ask about them). */
  'documents.dirty': [id: string, dirty: boolean];
  /** The page left edit mode (its text is saved or discarded): main takes the grant back. */
  'documents.leaveEdit': [id: string];
  /**
   * The page's answer to `documents.confirmClose`: `asking` at once (it put the question to the
   * reader), then `proceed` (every tab saved or discarded) or `cancel`.
   */
  'documents.closeAnswer': [answer: 'asking' | 'proceed' | 'cancel'];
  /** The tab's unsaved text, which main holds in memory only so a renderer crash doesn't lose it (ADR-013). */
  'documents.keep': [id: string, text: string, base: string | null];
  /** A tab shown anew (after a crash, or moved in): whether it is in edit mode, and its unsaved text. */
  'documents.recover': [id: string];
  /** The sender's tabs, as main knows them. */
  'tabs.snapshot': [];
  /** The window already shows this tab; main records it (the window activates tabs itself, ADR-002). */
  'tabs.activated': [id: string];
  /** How much the tab's rendered content weighs (UTF-16 bytes of its HTML or text), for the warm budget. */
  /** The page is about to insert the tab's document (crash recovery's breadcrumb, ADR-002). */
  'tabs.rendering': [id: string];
  'tabs.rendered': [id: string, weight: number];
  /** The reader asks to render a tab that crashed the window. */
  'tabs.renderAgain': [id: string];
  /** Where the reader is in the tab, reported after scrolling settles. */
  'tabs.position': [id: string, position: ScrollAnchor];
  /** The tab's zoom (1 is 100 %), kept by main for the session. */
  'tabs.zoom': [id: string, zoom: number];
  /** The tab's own reader width, kept by main for the session; null when it follows the setting again. */
  'tabs.width': [id: string, width: ReaderWidth | null];
  'tabs.viewState': [id: string, state: TabViewState];
  'tabs.close': [id: string];
  /** Brings back the window's most recently closed tab. */
  'tabs.reopenClosed': [];
  /** Moves a tab to `position` in the window's order. */
  'tabs.move': [id: string, position: number];
  /** The reader started dragging the tab: another window may take it, once (ADR-019). Spends real input. */
  'tabs.dragStart': [id: string, token: string];
  /** The window's drag ended without a window taking the tab. */
  'tabs.dragEnd': [id: string, outside: boolean];
  /** The tab another window's drag carries was dropped here, at `position`. */
  'tabs.adopt': [token: string, position: number];
  /** The window's dragged tab was dropped outside every window: it gets a window of its own. */
  /** Moves the tab to another window, or to a new one (the palette). Spends real input. */
  'tabs.moveTo': [id: string, target: number | 'new'];
  /** The other windows a tab can move to. */
  'tabs.windows': [];
  'settings.get': [];
  /** The profile's previous sessions ("Restore previous session", UX F6). */
  'session.previous': [];
  /** Opens one of them again, in new windows. */
  'session.restorePrevious': [snapshot: number];
  /** The profile's most recent files, each under an id this window may open (never a path). */
  'recent.list': [];
  'recent.open': [id: string];
  'recent.clear': [];
  /** The paths of a real drop, from the preload only. */
  'drops.register': [paths: string[]];
  'drops.open': [token: string, target: DropTarget];
  'quickOpen.start': [];
  'quickOpen.query': [token: string, query: string];
  'quickOpen.open': [token: string, id: string, newWindow: boolean];
  'quickOpen.close': [token: string];
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
  /** The font families installed on the system, for the font pickers (none where they can't be listed). */
  'settings.fonts': [];
  /** Opens the global or this profile's `custom.css` in the user's editor, creating it first. */
  'settings.openCustomCss': [scope: SettingsScope];
  /** Opens the file a settings notice names (by its place in the window's notices, never a path). */
  'settings.openNoticeFile': [index: number];
  /** Shows the window's settings tab (Ctrl+,), opening it if needed. */
  'tabs.openSettings': [];
  /** A window command from the palette, for the sender's window (keys reach main without the page). */
  'window.command': [command: WindowCommand];
  /** The crash-loop message's "Try again": the sender's window reloads with its tabs. Refused otherwise. */
  'window.retryAfterCrashes': [];
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
  'documents.save': SaveResult;
  'documents.dirty': void;
  'documents.leaveEdit': void;
  'documents.closeAnswer': void;
  'documents.keep': void;
  'documents.recover': Recovered;
  'tabs.snapshot': TabSnapshot;
  'tabs.activated': void;
  'tabs.rendering': void;
  'tabs.rendered': void;
  'tabs.renderAgain': void;
  'tabs.position': void;
  'tabs.zoom': void;
  'tabs.width': void;
  'tabs.viewState': void;
  'tabs.close': void;
  /** The reopened tab's id, or null when none was closed. */
  'tabs.reopenClosed': string | null;
  'tabs.move': void;
  /** False when main refused: a tab the window doesn't have, the settings tab, or no real input. */
  'tabs.dragStart': boolean;
  'tabs.dragEnd': void;
  /** False when no live drag carried that tab from another window. */
  'tabs.adopt': string | null;
  /** False when the drag was over, or the window had only that tab. */
  /** False when main refused: not the window's tab, the settings tab, no real input, or no such window. */
  'tabs.moveTo': boolean;
  'tabs.windows': OtherWindow[];
  'settings.get': SettingsState;
  'session.previous': PreviousSession[];
  'session.restorePrevious': void;
  'recent.list': { id: string; path: string }[];
  'recent.open': void;
  'recent.clear': void;
  'drops.register': void;
  /** A folder was dropped: quick open should open, searching it. */
  'drops.open': { folder: boolean };
  'quickOpen.start': QuickOpenStart;
  'quickOpen.query': QuickOpenResults;
  'quickOpen.open': void;
  'quickOpen.close': void;
  'profiles.created': { name: string; token: string } | null;
  'profiles.undoCreate': void;
  'profiles.list': ProfilesState;
  'profiles.open': void;
  'profiles.create': ProfileResult;
  'profiles.update': ProfileResult;
  'profiles.delete': void;
  'settings.set': SettingsResult;
  'settings.reset': SettingsResult;
  'settings.fonts': SystemFont[];
  'settings.openCustomCss': void;
  'settings.openNoticeFile': void;
  'tabs.openSettings': string;
  'window.command': void;
  'window.retryAfterCrashes': void;
}

/** Main → renderer events, named `<group>.<event>`; the page subscribes with `<group>.on<Event>`. */
export const EVENTS = ['tabs.changed', 'tabs.demote', 'tabs.stale', 'tabs.dragging', 'documents.editMode', 'documents.confirmClose', 'settings.changed', 'profiles.changed', 'quickOpen.results', 'drops.received'] as const;

export type EventName = (typeof EVENTS)[number];

/** The payload of each event. */
export interface Events {
  /** The window's tabs changed; a snapshot with a higher revision replaces the one before. */
  'tabs.changed': TabSnapshot;
  /** Hibernate these tabs: drop their rendered content, keep their place (ADR-002). */
  'tabs.demote': string[];
  /** The tab's file changed since the read it shows; read it again. */
  'tabs.stale': string;
  /** A tab is being dragged, in any window: the whole tab bar takes drops until it ends (ADR-019). */
  'tabs.dragging': boolean;
  /**
   * Ctrl+E (seen by main, never sent by the page): `granted`, the tab is now in edit mode; `leave`,
   * the reader asks to leave it, which the page does once its text is saved or discarded (ADR-013).
   */
  'documents.editMode': { id: string; edit: 'granted' | 'leave' | 'refused' };
  /** The window is closing (or the app quitting, or its profile going) with these tabs unsaved: ask the reader. */
  'documents.confirmClose': string[];
  'settings.changed': SettingsState;
  /** A profile was created, renamed, recoloured, deleted, started or stopped. */
  'profiles.changed': ProfilesState;
  /** More results for the open quick open's query: its repository walk found more. */
  'quickOpen.results': QuickOpenResults;
  /** Files were dropped on the window: open them where the drop landed with this token. */
  'drops.received': { token: string; count: number };
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
} & { app: { readonly startInfo: StartInfo | null } };
