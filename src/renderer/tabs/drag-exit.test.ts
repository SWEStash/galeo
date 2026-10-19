import { afterEach, describe, expect, it } from 'vitest';
import { watchDragExit } from './drag-exit';

const drag = (type: 'dragenter' | 'dragleave', relatedTarget: EventTarget | null) => {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'relatedTarget', { value: relatedTarget });
  document.body.dispatchEvent(event);
};

let stop: (() => void) | undefined;
afterEach(() => stop?.());

describe('watchDragExit (ADR-019)', () => {
  it('is inside until the pointer leaves the window, and inside again once it comes back', () => {
    const watch = watchDragExit(document);
    stop = watch.stop;
    expect(watch.outside()).toBe(false);
    drag('dragleave', document.body);
    expect(watch.outside()).toBe(false);
    drag('dragleave', null);
    expect(watch.outside()).toBe(true);
    drag('dragenter', document.body);
    expect(watch.outside()).toBe(false);
  });

  it('stops listening once stopped', () => {
    const watch = watchDragExit(document);
    watch.stop();
    drag('dragleave', null);
    expect(watch.outside()).toBe(false);
  });
});
