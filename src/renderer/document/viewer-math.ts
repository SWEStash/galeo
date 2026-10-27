import { clamp } from '../../shared/math';

/** The diagram viewer's pan and zoom: where the diagram's top-left corner sits, and its scale. */
export interface View {
  scale: number;
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;
/** Space left around a fitted diagram. */
const MARGIN = 24;

const clampScale = (scale: number) => clamp(scale, MIN_SCALE, MAX_SCALE);

const centred = (scale: number, content: Size, viewport: Size): View => ({
  scale,
  x: (viewport.width - content.width * scale) / 2,
  y: (viewport.height - content.height * scale) / 2,
});

/** The whole diagram in view, as large as fits, centred. */
export function fit(content: Size, viewport: Size): View {
  const scale = clampScale(Math.min((viewport.width - 2 * MARGIN) / content.width, (viewport.height - 2 * MARGIN) / content.height));
  return centred(scale, content, viewport);
}

/** The diagram at its natural size, centred. */
export function actualSize(content: Size, viewport: Size): View {
  return centred(1, content, viewport);
}

/** Zooms by `factor`, keeping the diagram point under `point` (viewport coordinates) where it is. */
export function zoomAt(view: View, factor: number, point: { x: number; y: number }): View {
  const scale = clampScale(view.scale * factor);
  const ratio = scale / view.scale;
  return { scale, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio };
}

export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, x: view.x + dx, y: view.y + dy };
}
