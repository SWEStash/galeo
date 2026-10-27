/** How long a drag stays claimable: a reader still holding a tab after this has let go somewhere. */
export const DRAG_MS = 120_000;
/**
 * How long a drag stays claimable after its window says it ended: the window the tab was dropped
 * on asks for it a moment later, and the two messages reach main in either order.
 */
export const SETTLE_MS = 500;

/** One drag, as its window said it ended: settled, it ends unless another window took it first. */
interface Drag {
  id: string;
  token: string;
  window: number;
  at: number;
}

/** Tokens remembered so none is taken twice; a drag's token is a fresh random one (ADR-022). */
const USED_TOKENS = 1000;

/**
 * The tab the reader is dragging, if any (ADR-019). A window takes a tab from another window only by
 * claiming the drag with its token, once (ADR-022): so a page takes only a tab the reader dragged over
 * it, whatever tab ids it knows, and a drop and a tear-off can't both happen.
 */
export class TabDrags {
  private drag: Drag | null = null;
  private readonly used = new Set<string>();

  /** Starts a drag of tab `id` from `window`, claimed by `token`; false for a token taken before. */
  start(id: string, token: string, window: number, now: number): boolean {
    if (this.used.has(token)) return false;
    this.used.add(token);
    if (this.used.size > USED_TOKENS) this.used.delete(this.used.values().next().value!);
    this.drag = { id, token, window, at: now };
    return true;
  }

  /**
   * Takes the drag with `token`: its tab and the window it came from, or null when no live drag has
   * that token, or (given `from`) when another window started it.
   */
  claim(token: string, now: number, from?: number): { id: string; window: number } | null {
    const drag = this.live(now);
    if (drag?.token !== token || (from !== undefined && drag.window !== from)) return null;
    this.drag = null;
    return { id: drag.id, window: drag.window };
  }

  /** The window's drag ended unclaimed; whether it had one going. */
  end(window: number): boolean {
    if (this.drag?.window !== window) return false;
    this.drag = null;
    return true;
  }

  /** The drag of tab `id` its window started, still unclaimed, to settle once SETTLE_MS have passed. */
  pending(id: string, window: number): Drag | null {
    return this.drag?.id === id && this.drag.window === window ? this.drag : null;
  }

  /** Ends the drag if nothing claimed it and no later drag took its place; whether it did. */
  settle(drag: Drag): boolean {
    if (this.drag !== drag) return false;
    this.drag = null;
    return true;
  }

  dragging(now: number): boolean {
    return this.live(now) !== null;
  }

  private live(now: number): Drag | null {
    if (this.drag && now - this.drag.at >= DRAG_MS) this.drag = null;
    return this.drag;
  }
}
