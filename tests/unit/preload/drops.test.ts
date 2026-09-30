import { describe, expect, it, vi } from 'vitest';
import { listenForDrops, type DropEventLike } from '../../../src/preload/drops';

function setup() {
  const listeners = new Map<string, (event: DropEventLike) => void>();
  const target = { addEventListener: (type: string, listener: (event: DropEventLike) => void) => void listeners.set(type, listener) };
  const register = vi.fn();
  listenForDrops(target, { pathFor: (file) => (file as unknown as { path: string }).path, register });
  const fire = (type: 'dragover' | 'drop', init: { isTrusted: boolean; files?: { path: string }[]; types?: string[] }) => {
    const event = {
      isTrusted: init.isTrusted,
      dataTransfer: { types: init.types ?? (init.files ? ['Files'] : ['text/plain']), files: (init.files ?? []) as unknown as FileList },
      preventDefault: vi.fn(),
    };
    listeners.get(type)!(event);
    return event;
  };
  return { fire, register };
}

describe('listenForDrops (SR-12)', () => {
  it('registers the paths of a real drop of files, in order', () => {
    const { fire, register } = setup();
    const event = fire('drop', { isTrusted: true, files: [{ path: '/d/b.md' }, { path: '/d/a.md' }] });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(register).toHaveBeenCalledWith(['/d/b.md', '/d/a.md']);
  });

  it('ignores a drop page script made up, while still keeping it from navigating', () => {
    const { fire, register } = setup();
    const event = fire('drop', { isTrusted: false, files: [{ path: '/etc/passwd' }] });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('skips files without a path (dragged from another app) and drags that carry no files', () => {
    const { fire, register } = setup();
    fire('drop', { isTrusted: true, files: [{ path: '' }] });
    fire('drop', { isTrusted: true, types: ['text/plain'] });
    expect(register).not.toHaveBeenCalled();
  });

  it('lets files be dropped anywhere in the window', () => {
    const { fire } = setup();
    expect(fire('dragover', { isTrusted: true, files: [] , types: ['Files'] }).preventDefault).toHaveBeenCalled();
    expect(fire('dragover', { isTrusted: true, types: ['text/plain'] }).preventDefault).not.toHaveBeenCalled();
  });
});
