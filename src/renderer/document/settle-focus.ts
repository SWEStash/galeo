/** How many frames after a modal or bar closes its focus restore may still land. */
const SETTLE_FRAMES = 10;

/**
 * Gives focus back with `back` once whatever had it is gone: a closed modal restores focus itself a
 * frame or more later, and from outside the document's shadow root it can only reach the host; a
 * bar button that removed its own bar leaves focus on the body. So for a few frames, focus left on
 * the body or a document host goes back; focus the reader moved anywhere else stays. Returns a cancel.
 */
export function settleFocus(back: () => void): () => void {
  let frames = 0;
  let frame = requestAnimationFrame(function settle() {
    const active = document.activeElement;
    if (active === document.body || active?.classList.contains('document-view')) back();
    if (++frames < SETTLE_FRAMES) frame = requestAnimationFrame(settle);
  });
  return () => cancelAnimationFrame(frame);
}
