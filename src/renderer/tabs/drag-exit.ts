/**
 * Follows a tab drag's pointer: whether it is outside the window now. A drop outside every window
 * ends the drag exactly like Esc does, so this is how the tab bar tells a tear-off (ADR-019): the
 * drag ended unclaimed while the pointer was out.
 */
export function watchDragExit(document: Document): { outside: () => boolean; stop: () => void } {
  let outside = false;
  // Leaving one element for another names the other; leaving the window names none.
  const left = (event: Event) => {
    if ((event as DragEvent).relatedTarget === null) outside = true;
  };
  const entered = () => {
    outside = false;
  };
  document.addEventListener('dragleave', left);
  document.addEventListener('dragenter', entered);
  return {
    outside: () => outside,
    stop: () => {
      document.removeEventListener('dragleave', left);
      document.removeEventListener('dragenter', entered);
    },
  };
}
