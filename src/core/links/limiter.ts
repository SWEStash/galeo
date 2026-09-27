import type { Clock } from '../ports';

/** At most one external open per window per second (SR-04). */
const WINDOW_INTERVAL_MS = 1000;
/** More than this many opens from one document within the window below needs a confirmation. */
const BURST_OPENS = 3;
const BURST_WINDOW_MS = 10_000;

export type OpenDecision = 'open' | 'confirm' | 'too-fast' | 'blocked';

/**
 * Rate limits for handing URLs to the browser, so a document can't turn it into a spam or
 * exfiltration channel. `confirm` means main asks the user, then calls `allow` or `block`.
 */
export class ExternalOpenLimiter {
  private readonly lastByWindow = new Map<number, number>();
  private readonly opensByDocument = new Map<string, number[]>();
  private readonly allowed = new Set<string>();
  private readonly blocked = new Set<string>();

  constructor(private readonly clock: Clock) {}

  request(window: number, document: string): OpenDecision {
    const now = this.clock.now();
    if (this.blocked.has(document)) return 'blocked';
    const last = this.lastByWindow.get(window);
    if (last !== undefined && now - last < WINDOW_INTERVAL_MS) return 'too-fast';
    const recent = (this.opensByDocument.get(document) ?? []).filter((at) => now - at < BURST_WINDOW_MS);
    this.opensByDocument.set(document, recent);
    if (recent.length >= BURST_OPENS && !this.allowed.has(document)) return 'confirm';
    this.record(window, document, now);
    return 'open';
  }

  /** The user allowed a burst: this open goes ahead, and the document isn't asked about again. */
  allow(window: number, document: string): void {
    this.allowed.add(document);
    this.record(window, document, this.clock.now());
  }

  /** The user blocked the document: none of its links open any more. */
  block(document: string): void {
    this.blocked.add(document);
  }

  private record(window: number, document: string, at: number): void {
    this.lastByWindow.set(window, at);
    this.opensByDocument.set(document, [...(this.opensByDocument.get(document) ?? []), at]);
  }
}
