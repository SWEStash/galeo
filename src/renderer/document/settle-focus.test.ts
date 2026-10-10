import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { settleFocus } from './settle-focus';

let frames: FrameRequestCallback[] = [];
const nextFrame = () => {
  const due = frames;
  frames = [];
  for (const callback of due) callback(0);
};

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => (frames = []));
});
afterEach(() => {
  vi.unstubAllGlobals();
  frames = [];
  document.body.replaceChildren();
});

describe('settleFocus', () => {
  it('takes focus back when it is left on the body or a document host, for a few frames', () => {
    const host = document.body.appendChild(document.createElement('div'));
    host.className = 'document-view';
    host.tabIndex = -1;
    const back = vi.fn();
    settleFocus(back);
    nextFrame();
    expect(back).toHaveBeenCalledTimes(1);
    host.focus();
    nextFrame();
    expect(back).toHaveBeenCalledTimes(2);
    for (let frame = 0; frame < 20; frame++) nextFrame();
    expect(back).toHaveBeenCalledTimes(10);
  });

  it('leaves focus the reader moved anywhere else', () => {
    const button = document.body.appendChild(document.createElement('button'));
    button.focus();
    const back = vi.fn();
    settleFocus(back);
    nextFrame();
    expect(back).not.toHaveBeenCalled();
  });

  it('stops when cancelled', () => {
    const back = vi.fn();
    settleFocus(back)();
    nextFrame();
    expect(back).not.toHaveBeenCalled();
  });
});
