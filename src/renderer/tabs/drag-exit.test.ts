import { afterEach, describe, expect, it } from 'vitest';
import { watchDragExit } from './drag-exit';

const drag = (type: 'dragenter' | 'dragleave', relatedTarget: EventTarget | null, on: Element = document.body) => {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'relatedTarget', { value: relatedTarget });
  on.dispatchEvent(event);
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

  it('follows the pointer over a drop target that keeps its drag events to itself', () => {
    // A drop target (the document area, the tab list) stops its enter and leave events there.
    const target = document.body.appendChild(document.createElement('div'));
    const swallow = (event: Event) => event.stopPropagation();
    target.addEventListener('dragenter', swallow);
    target.addEventListener('dragleave', swallow);
    const watch = watchDragExit(document);
    stop = () => {
      watch.stop();
      target.remove();
    };
    drag('dragleave', null, target);
    expect(watch.outside()).toBe(true);
    drag('dragenter', null, target);
    expect(watch.outside()).toBe(false);
  });

  it('stops listening once stopped', () => {
    const watch = watchDragExit(document);
    watch.stop();
    drag('dragleave', null);
    expect(watch.outside()).toBe(false);
  });
});
