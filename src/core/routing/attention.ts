/**
 * Whether a routed open should make its window ask for attention (the taskbar flashes, GNOME says
 * "is ready"): files went into a window already open elsewhere, which is never raised or focused
 * for them (ADR-005). A new window shows itself; a request without files focuses its window.
 */
export function asksForAttention(opened: { fresh: boolean; files: number; focused: boolean }): boolean {
  return !opened.fresh && opened.files > 0 && !opened.focused;
}
