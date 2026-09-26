import type { ZodType } from 'zod';

/** The part of Electron's `IpcMainInvokeEvent` the checks need. */
export interface IpcEvent {
  senderFrame: { url: string; parent: unknown } | null;
}

function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    // `URL.origin` is "null" for custom schemes, so build it from the parts.
    return parsed.host ? `${parsed.protocol}//${parsed.host}` : null;
  } catch {
    return null;
  }
}

/** The sender is the main frame of a page served from a trusted origin (SR-11). */
export function isTrustedSender(event: IpcEvent, trustedOrigins: ReadonlySet<string>): boolean {
  const frame = event.senderFrame;
  if (!frame || frame.parent !== null) return false;
  const origin = originOf(frame.url);
  return origin !== null && trustedOrigins.has(origin);
}

export interface HandlerOptions<Args extends unknown[], Result> {
  channel: string;
  schema: ZodType<Args>;
  trustedOrigins: ReadonlySet<string>;
  handle: (args: Args, event: IpcEvent) => Result | Promise<Result>;
  onReject?: (channel: string, reason: string) => void;
}

/**
 * Wraps an IPC handler so it runs only for a trusted sender with arguments that pass the
 * channel's schema. Anything else is rejected and reported.
 */
export function createHandler<Args extends unknown[], Result>({
  channel,
  schema,
  trustedOrigins,
  handle,
  onReject = (name, reason) => console.warn(`[ipc] rejected ${name}: ${reason}`),
}: HandlerOptions<Args, Result>): (event: IpcEvent, ...args: unknown[]) => Promise<Result> {
  const reject = (reason: string): never => {
    onReject(channel, reason);
    throw new Error(`${channel}: ${reason}`);
  };
  return async (event, ...args) => {
    if (!isTrustedSender(event, trustedOrigins)) return reject('untrusted sender');
    const parsed = schema.safeParse(args);
    if (!parsed.success) return reject('invalid arguments');
    return handle(parsed.data, event);
  };
}
