// The IPC contract between main and the renderer (ADR-007, SR-11). Only names and types live
// here: main validates every request with its own schemas, and the preload builds
// `window.galeo` from `CHANNELS` and `EVENTS`, one fixed method per channel or event.
import type { DocumentContent, DocumentRecord, FollowResult, HistoryResult, ImageResult } from '../documents';
import type { Platform } from '../keymap';
import type { Settings, SettingsNotice } from '../settings';
import type { ScrollAnchor, TabSnapshot } from '../tabs';

export type { DocumentContent, DocumentRecord, FollowResult, HistoryResult, ImageResult, ScrollAnchor, TabSnapshot };

/** The window's resolved settings, and the config files it couldn't use (SR-17). */
export interface SettingsState {
  settings: Settings;
  notices: SettingsNotice[];
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
}

/** Renderer → main request/response channels, named `<group>.<method>`. */
export const CHANNELS = [
  'app.info',
  'app.resolveSandboxUnavailable',
  'documents.read',
  'documents.setEncoding',
  'documents.followLink',
  'documents.back',
  'documents.forward',
  'documents.resolveImage',
  'documents.pathMenu',
  'tabs.snapshot',
  'tabs.activated',
  'tabs.rendered',
  'tabs.position',
  'tabs.close',
  'tabs.reopenClosed',
  'tabs.move',
  'settings.get',
] as const;

export type Channel = (typeof CHANNELS)[number];

/** Arguments of each channel, as a tuple. */
export interface Requests {
  'app.info': [];
  'app.resolveSandboxUnavailable': [choice: SandboxChoice];
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
  /** The sender's tabs, as main knows them. */
  'tabs.snapshot': [];
  /** The window already shows this tab; main records it (the window activates tabs itself, ADR-002). */
  'tabs.activated': [id: string];
  /** How much the tab's rendered content weighs (UTF-16 bytes of its HTML or text), for the warm budget. */
  'tabs.rendered': [id: string, weight: number];
  /** Where the reader is in the tab, reported after scrolling settles. */
  'tabs.position': [id: string, position: ScrollAnchor];
  'tabs.close': [id: string];
  /** Brings back the window's most recently closed tab. */
  'tabs.reopenClosed': [];
  /** Moves a tab to `position` in the window's order. */
  'tabs.move': [id: string, position: number];
  'settings.get': [];
}

/** Resolved value of each channel. */
export interface Responses {
  'app.info': AppInfo;
  'app.resolveSandboxUnavailable': void;
  'documents.read': DocumentContent;
  'documents.setEncoding': void;
  'documents.followLink': FollowResult;
  'documents.back': HistoryResult;
  'documents.forward': HistoryResult;
  'documents.resolveImage': ImageResult;
  'documents.pathMenu': void;
  'tabs.snapshot': TabSnapshot;
  'tabs.activated': void;
  'tabs.rendered': void;
  'tabs.position': void;
  'tabs.close': void;
  /** The reopened tab's id, or null when none was closed. */
  'tabs.reopenClosed': string | null;
  'tabs.move': void;
  'settings.get': SettingsState;
}

/** Main → renderer events, named `<group>.<event>`; the page subscribes with `<group>.on<Event>`. */
export const EVENTS = ['tabs.changed', 'tabs.demote', 'tabs.stale', 'settings.changed'] as const;

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
