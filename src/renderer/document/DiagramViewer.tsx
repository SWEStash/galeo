import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { setTrustedHtml } from './host';
import { actualSize, fit, panBy, zoomAt, type View } from './viewer-math';

/** One key or button press zooms by this much; the wheel zooms smoothly. */
const STEP = 1.25;
const ARROW_PAN = 40;

/**
 * A diagram in a full-window viewer: it opens fitted to the window, then zooms (buttons, + and -,
 * the wheel around the pointer) and pans (dragging, the arrow keys). 0 fits it again, 1 shows it at
 * its natural size. The SVG is the one already checked and drawn in the document, in a shadow
 * root of its own.
 */
export function DiagramViewer({ svg, name, onClose }: { svg: string; name: string; onClose: () => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const natural = useRef({ width: 1, height: 1 });
  const [view, setView] = useState<View | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const box = () => {
    const { width, height } = viewport.current!.getBoundingClientRect();
    return { width, height };
  };
  const fitted = useCallback(() => setView(fit(natural.current, box())), []);
  const zoomCentred = (factor: number) => {
    const { width, height } = box();
    setView((now) => now && zoomAt(now, factor, { x: width / 2, y: height / 2 }));
  };

  useLayoutEffect(() => {
    const shadow = holder.current!.shadowRoot ?? holder.current!.attachShadow({ mode: 'open' });
    setTrustedHtml(shadow, svg);
    const drawn = shadow.querySelector('svg');
    const { width, height } = drawn?.viewBox.baseVal ?? { width: 0, height: 0 };
    if (drawn && width > 0 && height > 0) {
      natural.current = { width, height };
      // Its own size, scaled by the stage: not the document's fit-the-column sizing.
      drawn.style.removeProperty('max-width');
      drawn.setAttribute('width', String(width));
      drawn.setAttribute('height', String(height));
    }
    fitted();
  }, [svg, fitted]);

  // The wheel zooms around the pointer; it must not scroll the page behind.
  useEffect(() => {
    const element = viewport.current!;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const origin = element.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.002));
      setView((now) => now && zoomAt(now, factor, { x: event.clientX - origin.left, y: event.clientY - origin.top }));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    const from = drag.current;
    if (!from) return;
    drag.current = { x: event.clientX, y: event.clientY };
    setView((now) => now && panBy(now, event.clientX - from.x, event.clientY - from.y));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const pans: Record<string, [number, number]> = { ArrowLeft: [ARROW_PAN, 0], ArrowRight: [-ARROW_PAN, 0], ArrowUp: [0, ARROW_PAN], ArrowDown: [0, -ARROW_PAN] };
    const pan = pans[event.key];
    if (event.key === '+' || event.key === '=') zoomCentred(STEP);
    else if (event.key === '-') zoomCentred(1 / STEP);
    else if (event.key === '0') fitted();
    else if (event.key === '1') setView(actualSize(natural.current, box()));
    else if (pan) setView((now) => now && panBy(now, ...pan));
    else return;
    event.preventDefault();
  };

  return (
    <ModalOverlay className="modal-overlay" isOpen isDismissable onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Modal className="modal diagram-viewer">
        {/* Keys reach here from the dialog (focused when it opens) and every control in it. */}
        <div className="diagram-viewer-keys" onKeyDown={onKeyDown}>
          <Dialog className="dialog diagram-viewer-dialog" aria-label={name}>
            <div className="diagram-viewer-body">
              <div className="diagram-viewer-bar">
                <Heading slot="title" className="diagram-viewer-title">
                  {name}
                </Heading>
                <span className="diagram-viewer-zoom" aria-hidden="true">
                  {view ? `${Math.round(view.scale * 100)} %` : ''}
                </span>
                <Button aria-label="Zoom out (−)" onPress={() => zoomCentred(1 / STEP)}>
                  −
                </Button>
                <Button aria-label="Fit to window (0)" onPress={fitted}>
                  Fit
                </Button>
                <Button aria-label="Actual size (1)" onPress={() => setView(actualSize(natural.current, box()))}>
                  100 %
                </Button>
                <Button aria-label="Zoom in (+)" onPress={() => zoomCentred(STEP)}>
                  +
                </Button>
                <Button aria-label="Close (Esc)" onPress={onClose}>
                  ✕
                </Button>
              </div>
              <div
                ref={viewport}
                className="diagram-viewer-viewport"
                data-testid="diagram-viewport"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <div
                  className="diagram-viewer-stage"
                  data-testid="diagram-stage"
                  data-scale={view?.scale}
                  data-x={view?.x}
                  style={view ? { transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` } : { visibility: 'hidden' }}
                >
                  <div ref={holder} className="galeo-viewer-svg" />
                </div>
              </div>
            </div>
          </Dialog>
        </div>
      </Modal>
    </ModalOverlay>
  );
}
