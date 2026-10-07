/** Below this in both dimensions an image is an icon or a badge: nothing to see larger. */
const ICON_PX = 48;

export function zoomable({ width, height }: { width: number; height: number }): boolean {
  return width >= ICON_PX || height >= ICON_PX;
}

export interface ImageExpand {
  url: string;
  name: string;
  /** Focuses the image's Expand button, once the viewer is closed. */
  returnFocus: () => void;
}

/**
 * Offers the viewer for a loaded document image that is more than an icon: an Expand button
 * beside it (shown on hover and keyboard focus), and a click on the image itself, unless the
 * image is a link, whose click follows the link.
 */
export function offerZoom(image: HTMLImageElement, onExpand: (image: ImageExpand) => void): void {
  if (!zoomable({ width: image.naturalWidth, height: image.naturalHeight })) return;
  const name = image.alt.trim() || 'Image';
  const frame = document.createElement('span');
  frame.className = 'galeo-image';
  const expand = document.createElement('button');
  expand.type = 'button';
  expand.className = 'galeo-image-expand';
  expand.setAttribute('aria-label', 'Expand image');
  expand.title = 'Expand image';
  expand.textContent = '⤢';
  const open = () => onExpand({ url: image.src, name, returnFocus: () => expand.focus() });
  expand.addEventListener('click', (event) => {
    // Inside a link, the button opens the viewer and the link stays where it is.
    event.preventDefault();
    event.stopPropagation();
    open();
  });
  if (!image.closest('a[href]')) image.addEventListener('click', open);
  image.replaceWith(frame);
  frame.append(image, expand);
}
