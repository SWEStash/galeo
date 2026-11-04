/** A document over this many characters gets no baseline, and so no change marks (ADR-030). */
const MAX_DOC_CHARS = 2_000_000;
/** All of a window's baselines together; past it, the ones set longest ago go first. */
const MAX_TOTAL_CHARS = 16_000_000;

/**
 * The text each tab showed when the reader last looked at it (ADR-030): what change marks compare a
 * new read with. One store per window, in the page's memory only; it outlives a tab's hibernation.
 */
interface Baselines {
  /** The tab's baseline for this file, or null: none yet, another file, or too large. */
  get(id: string, path: string): string | null;
  /** Takes `text` as the baseline unless the tab already has one for this file (the first look). */
  ensure(id: string, path: string, text: string): void;
  /** Takes `text` as the baseline (leaving the tab, clearing the marks, a save, the end of edit mode). */
  reset(id: string, path: string, text: string): void;
  forget(id: string): void;
  /** Drops the baselines of tabs no longer in the window (closed, or moved to another). */
  retain(ids: ReadonlySet<string>): void;
  tooLarge(text: string): boolean;
}

export function createBaselines({ maxDocChars = MAX_DOC_CHARS, maxTotalChars = MAX_TOTAL_CHARS } = {}): Baselines {
  // In the order they were set: the first ones go first when the total passes the cap.
  const held = new Map<string, { path: string; text: string }>();
  let total = 0;

  const forget = (id: string) => {
    const old = held.get(id);
    if (!old) return;
    total -= old.text.length;
    held.delete(id);
  };

  const reset = (id: string, path: string, text: string) => {
    forget(id);
    if (text.length > maxDocChars) return;
    held.set(id, { path, text });
    total += text.length;
    for (const oldest of held.keys()) {
      if (total <= maxTotalChars || oldest === id) break;
      forget(oldest);
    }
  };

  return {
    get: (id, path) => {
      const kept = held.get(id);
      return kept?.path === path ? kept.text : null;
    },
    ensure: (id, path, text) => {
      if (held.get(id)?.path !== path) reset(id, path, text);
    },
    reset,
    forget,
    retain: (ids) => {
      for (const id of [...held.keys()]) if (!ids.has(id)) forget(id);
    },
    tooLarge: (text) => text.length > maxDocChars,
  };
}

/** The window's baselines. */
export const baselines = createBaselines();
