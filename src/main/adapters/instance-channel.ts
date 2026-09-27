import type { InstanceChannel, OpenRequest, Unsubscribe } from '../../core/ports';

/** The part of Electron's `app` this adapter uses. */
export interface InstanceApp {
  requestSingleInstanceLock(additionalData?: Record<string, unknown>): boolean;
  on(
    event: 'second-instance',
    listener: (event: unknown, argv: string[], cwd: string, additionalData: unknown) => void,
  ): unknown;
  on(event: 'open-file', listener: (event: { preventDefault(): void }, path: string) => void): unknown;
}

const MAX_ARGS = 1_000;
const MAX_ARG_LENGTH = 4_096;

/** Forwarded launch data, if it's the shape this app sends (SR-13); anything else is dropped. */
function forwardedLaunch(data: unknown): { argv: string[]; cwd: string } | null {
  if (typeof data !== 'object' || data === null) return null;
  const { argv, cwd } = data as { argv?: unknown; cwd?: unknown };
  if (typeof cwd !== 'string' || cwd === '' || !Array.isArray(argv) || argv.length > MAX_ARGS) return null;
  const valid = argv.every((arg) => typeof arg === 'string' && arg.length <= MAX_ARG_LENGTH);
  return valid ? { argv: argv as string[], cwd } : null;
}

/**
 * The single-instance lock and every open request: the first launch, later launches forwarded to
 * this instance, and macOS `open-file` events. Later launches send their own arguments as the
 * lock's additional data, because Chromium may add switches to the argv the event reports.
 * Requests that arrive before anyone listens are kept and delivered in order.
 */
export class ElectronInstanceChannel implements InstanceChannel {
  private readonly pending: OpenRequest[];
  private listener: ((request: OpenRequest) => void) | null = null;

  constructor(
    private readonly app: InstanceApp,
    private readonly launch: { argv: string[]; cwd: string },
  ) {
    this.pending = [{ source: 'launch', argv: launch.argv, cwd: launch.cwd }];
    app.on('second-instance', (_event, _argv, cwd, data) => {
      this.deliver({ source: 'second-instance', ...(forwardedLaunch(data) ?? { argv: [], cwd }) });
    });
    app.on('open-file', (event, path) => {
      event.preventDefault();
      this.deliver({ source: 'open-file', argv: ['--', path], cwd: '/' });
    });
  }

  acquire(): boolean {
    return this.app.requestSingleInstanceLock({ argv: this.launch.argv, cwd: this.launch.cwd });
  }

  onOpenRequest(listener: (request: OpenRequest) => void): Unsubscribe {
    this.listener = listener;
    for (const request of this.pending.splice(0)) listener(request);
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }

  private deliver(request: OpenRequest): void {
    if (this.listener) this.listener(request);
    else this.pending.push(request);
  }
}
