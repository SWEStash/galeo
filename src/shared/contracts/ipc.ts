// The IPC contract between main and the renderer (ADR-007, SR-11). Only names and types live
// here: main validates every request with its own schemas, and the preload builds
// `window.galeo` from `CHANNELS`, one fixed method per channel.

/** Why Chromium's sandbox couldn't start, as detected by the Linux launcher wrapper (ADR-009). */
export type SandboxCause = 'apparmor-userns' | 'suid-helper' | 'unknown';

export type SandboxChoice = 'quit' | 'run-unsandboxed';

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  sandboxed: boolean;
  /** Set while the app shows only the sandbox-unavailable choice (ADR-009). */
  sandboxUnavailable: SandboxCause | null;
}

/** Renderer → main request/response channels, named `<group>.<method>`. */
export const CHANNELS = ['app.info', 'app.resolveSandboxUnavailable'] as const;

export type Channel = (typeof CHANNELS)[number];

/** Arguments of each channel, as a tuple. */
export interface Requests {
  'app.info': [];
  'app.resolveSandboxUnavailable': [choice: SandboxChoice];
}

/** Resolved value of each channel. */
export interface Responses {
  'app.info': AppInfo;
  'app.resolveSandboxUnavailable': void;
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
