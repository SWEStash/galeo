/**
 * Whether a routed open should make its window ask for attention (the taskbar flashes, GNOME says
 * "is ready"): files went into a window already open elsewhere, which is never raised or focused
 * for them (ADR-005). A new window shows itself; a request without files focuses its window.
 */
export function asksForAttention(opened: { fresh: boolean; files: number; focused: boolean }): boolean {
  return !opened.fresh && opened.files > 0 && !opened.focused;
}

/**
 * How a window asks for attention. On Wayland, flashing the frame reaches nothing, so the window asks
 * to be activated instead: GNOME refuses a window that isn't the reader's focus and shows its "is
 * ready" notice, so the window still isn't raised. Chromium runs on Wayland when it's picked, or by
 * default when a Wayland display is there.
 */
export function attentionRequest(session: { platform: string; ozonePlatform: string; waylandDisplay: boolean }): 'activate' | 'flash' {
  if (session.platform !== 'linux') return 'flash';
  const platform = session.ozonePlatform === '' || session.ozonePlatform === 'auto' ? (session.waylandDisplay ? 'wayland' : 'x11') : session.ozonePlatform;
  return platform === 'wayland' ? 'activate' : 'flash';
}
