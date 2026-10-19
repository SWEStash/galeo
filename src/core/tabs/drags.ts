/** How long a drag stays claimable: a reader still holding a tab after this has let go somewhere. */
export const DRAG_MS = 120_000;
/**
 * How long a drag stays claimable after its window says it ended: the window the tab was dropped
 * on asks for it a moment later, and the two messages reach main in either order.
 */
export const SETTLE_MS = 500;

/** One drag, as its window said it ended: settled, it ends unless another window took it first. */
export interface Drag {
  id: string;
  window: number;
  at: number;
}

/**
 * The tab the reader is dragging, if any (ADR-019). A window takes a tab from another window only by
 * claiming the drag that carries it, once: so a page takes only a tab the reader is dragging, and a
 * drop and a tear-off can't both happen.
 */
export class TabDrags {
  private drag: Drag | null = null;

  start(id: string, window: number, now: number): void {
    this.drag = { id, window, at: now };
  }

  /**
   * Takes the drag of tab `id`: the window it came from, or null when no live drag carries it, or
   * (given `from`) when another window started it.
   */
  claim(id: string, now: number, from?: number): number | null {
    const drag = this.live(now);
    if (drag?.id !== id || (from !== undefined && drag.window !== from)) return null;
    this.drag = null;
    return drag.window;
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
