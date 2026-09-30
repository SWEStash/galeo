import { describe, expect, it, vi } from 'vitest';
import { CommandDispatcher } from './dispatcher';

const keydown = (init: KeyboardEventInit, target: EventTarget = window) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

function listening(platform: 'linux' | 'darwin' = 'linux') {
  const dispatcher = new CommandDispatcher(platform);
  window.addEventListener('keydown', dispatcher.onKey, true);
  return { dispatcher, stop: () => window.removeEventListener('keydown', dispatcher.onKey, true) };
}

describe('CommandDispatcher', () => {
  it("runs a key's command and takes the key from the page", () => {
    const { dispatcher, stop } = listening();
    const handler = vi.fn();
    dispatcher.register('toggleSource', handler);

    const event = keydown({ key: 'u', ctrlKey: true });
    stop();

    expect(handler).toHaveBeenCalledWith({ typing: false, tabNumber: null });
    expect(event.defaultPrevented).toBe(true);
  });

  it('follows the platform: Cmd on macOS', () => {
    const { dispatcher, stop } = listening('darwin');
    const handler = vi.fn();
    dispatcher.register('toggleSource', handler);

    keydown({ key: 'u', ctrlKey: true });
    keydown({ key: 'u', metaKey: true });
    stop();

    expect(handler).toHaveBeenCalledOnce();
  });

  it('leaves the key to the page when no handler takes it', () => {
    const { dispatcher, stop } = listening();
    dispatcher.register('toggleWrap', () => false);

    const declined = keydown({ key: 'z', altKey: true });
    const unhandled = keydown({ key: 'u', ctrlKey: true });
    const other = keydown({ key: 'a' });
    stop();

    expect([declined, unhandled, other].map((event) => event.defaultPrevented)).toEqual([false, false, false]);
  });

  it('asks the latest handler first, and an earlier one when it declines', () => {
    const dispatcher = new CommandDispatcher('linux');
    const calls: string[] = [];
    dispatcher.register('reload', () => void calls.push('first'));
    const stopSecond = dispatcher.register('reload', () => {
      calls.push('second');
      return false;
    });

    expect(dispatcher.run('reload')).toBe(true);
    stopSecond();
    dispatcher.run('reload');

    expect(calls).toEqual(['second', 'first', 'first']);
  });

  it('forgets a handler once unregistered', () => {
    const dispatcher = new CommandDispatcher('linux');
    const handler = vi.fn();
    dispatcher.register('find', handler)();

    expect(dispatcher.run('find')).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('tells handlers when the key was pressed in a text field, and which tab a number key names', () => {
    const { dispatcher, stop } = listening();
    const follow = vi.fn(() => false);
    const goTo = vi.fn();
    dispatcher.register('followEnd', follow);
    dispatcher.register('goToTab', goTo);
    const input = document.createElement('input');
    document.body.append(input);

    keydown({ key: 'End' }, input);
    keydown({ key: '3', ctrlKey: true });
    stop();
    input.remove();

    expect(follow).toHaveBeenCalledWith({ typing: true, tabNumber: null });
    expect(goTo).toHaveBeenCalledWith({ typing: false, tabNumber: 3 });
  });
});
