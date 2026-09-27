// The IPC contract between main and the renderer (ADR-007, SR-11). Only names and types live
// here: main validates every request with its own schemas, and the preload builds
// `window.galeo` from `CHANNELS`, one fixed method per channel.
import type { DocumentContent, DocumentRecord, FollowResult, HistoryResult, ImageResult } from '../documents';
import type { Platform } from '../keymap';

export type { DocumentContent, DocumentRecord, FollowResult, HistoryResult, ImageResult };

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
  'documents.list',
  'documents.read',
  'documents.followLink',
  'documents.back',
  'documents.forward',
  'documents.resolveImage',
] as const;

export type Channel = (typeof CHANNELS)[number];

/** Arguments of each channel, as a tuple. */
export interface Requests {
  'app.info': [];
  'app.resolveSandboxUnavailable': [choice: SandboxChoice];
  /** The documents open in the sender's window. */
  'documents.list': [];
  /** Reads one of them by id; there is no way to read by path (SR-12). */
  'documents.read': [id: string];
  /** Follows a link of the document, as written in it; main checks it against the file (SR-04). */
  'documents.followLink': [id: string, href: string];
  'documents.back': [id: string];
  'documents.forward': [id: string];
  /** An image the document shows, as written in it; main answers with an opaque URL (ADR-004). */
  'documents.resolveImage': [id: string, src: string];
}

/** Resolved value of each channel. */
export interface Responses {
  'app.info': AppInfo;
  'app.resolveSandboxUnavailable': void;
  'documents.list': DocumentRecord[];
  'documents.read': DocumentContent;
  'documents.followLink': FollowResult;
  'documents.back': HistoryResult;
  'documents.forward': HistoryResult;
  'documents.resolveImage': ImageResult;
}

type Group<C extends string> = C extends `${infer G}.${string}` ? G : never;

/** The API the preload exposes as `window.galeo`. */
export type GaleoApi = {
  [G in Group<Channel>]: {
    [C in Channel as C extends `${G}.${infer M}` ? M : never]: (
      ...args: Requests[C]
    ) => Promise<Responses[C]>;
  };
};
