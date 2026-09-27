import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { OpenRequest } from '../../core/ports';
import { ElectronInstanceChannel, type InstanceApp } from './instance-channel';

class FakeApp extends EventEmitter implements InstanceApp {
  lockData: unknown;
  constructor(private readonly lock = true) {
    super();
  }
  requestSingleInstanceLock(additionalData?: Record<string, unknown>): boolean {
    this.lockData = additionalData;
    return this.lock;
  }
}

const launch = { argv: ['--profile', 'acme', '--', 'a.md'], cwd: '/work' };

function collect(channel: ElectronInstanceChannel) {
  const requests: OpenRequest[] = [];
  const stop = channel.onOpenRequest((request) => requests.push(request));
  return { requests, stop };
}

describe('ElectronInstanceChannel', () => {
  it('takes the lock and forwards its own arguments to the running instance', () => {
    const app = new FakeApp(false);
    const channel = new ElectronInstanceChannel(app, launch);
    expect(channel.acquire()).toBe(false);
    expect(app.lockData).toEqual({ argv: launch.argv, cwd: '/work' });
  });

  it('delivers the first launch as the first request', () => {
    const { requests } = collect(new ElectronInstanceChannel(new FakeApp(), launch));
    expect(requests).toEqual([{ source: 'launch', argv: launch.argv, cwd: '/work' }]);
  });

  it('uses the forwarded arguments of a later launch, not the raw argv', () => {
    const app = new FakeApp();
    const { requests } = collect(new ElectronInstanceChannel(app, launch));
    app.emit('second-instance', {}, ['/usr/bin/galeo', '--some-chromium-switch', 'x'], '/raw', {
      argv: ['--', 'b.md'],
      cwd: '/other',
    });
    expect(requests[1]).toEqual({ source: 'second-instance', argv: ['--', 'b.md'], cwd: '/other' });
  });

  it.each([
    ['missing', undefined],
    ['not an object', 'x'],
    ['argv not strings', { argv: [1], cwd: '/other' }],
    ['without a cwd', { argv: ['--', 'b.md'] }],
    ['too many arguments', { argv: Array.from({ length: 1_001 }, () => 'f'), cwd: '/other' }],
    ['an oversized argument', { argv: ['x'.repeat(4_097)], cwd: '/other' }],
  ])('treats forwarded data that is %s as a plain focus request', (_label, data) => {
    const app = new FakeApp();
    const { requests } = collect(new ElectronInstanceChannel(app, launch));
    app.emit('second-instance', {}, ['/usr/bin/galeo', 'evil.md'], '/raw', data);
    expect(requests[1]).toEqual({ source: 'second-instance', argv: [], cwd: '/raw' });
  });

  it('turns macOS open-file events into file requests, buffered until someone listens', () => {
    const app = new FakeApp();
    const channel = new ElectronInstanceChannel(app, launch);
    const event = { preventDefault: vi.fn() };
    app.emit('open-file', event, '/Users/u/notes.md');
    expect(event.preventDefault).toHaveBeenCalled();

    const { requests } = collect(channel);
    expect(requests).toEqual([
      { source: 'launch', argv: launch.argv, cwd: '/work' },
      { source: 'open-file', argv: ['--', '/Users/u/notes.md'], cwd: '/' },
    ]);
  });

  it('stops delivering after unsubscribe', () => {
    const app = new FakeApp();
    const { requests, stop } = collect(new ElectronInstanceChannel(app, launch));
    stop();
    app.emit('open-file', { preventDefault() {} }, '/x.md');
    expect(requests).toHaveLength(1);
  });
});
