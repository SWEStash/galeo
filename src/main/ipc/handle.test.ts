import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createHandler, isTrustedSender, type IpcEvent } from './handle';

const ORIGINS = new Set(['galeo://app']);

function eventFrom(url: string, parent: unknown = null): IpcEvent {
  return { senderFrame: { url, parent } };
}

describe('isTrustedSender', () => {
  it('accepts the main frame of an app page', () => {
    expect(isTrustedSender(eventFrom('galeo://app/index.html'), ORIGINS)).toBe(true);
  });

  it('rejects a subframe, even with the app origin', () => {
    expect(isTrustedSender(eventFrom('galeo://app/index.html', {}), ORIGINS)).toBe(false);
  });

  it.each(['file:///tmp/evil.html', 'https://example.com/', 'galeo://file/1', 'data:text/html,x', 'not a url'])(
    'rejects a foreign origin: %s',
    (url) => {
      expect(isTrustedSender(eventFrom(url), ORIGINS)).toBe(false);
    },
  );

  it('rejects an event without a sender frame (already destroyed)', () => {
    expect(isTrustedSender({ senderFrame: null }, ORIGINS)).toBe(false);
  });
});

describe('createHandler', () => {
  const trusted = eventFrom('galeo://app/index.html');

  function makeHandler() {
    const handle = vi.fn((args: [string]) => `hello ${args[0]}`);
    const onReject = vi.fn();
    const handler = createHandler({
      channel: 'test.greet',
      schema: z.tuple([z.string().max(8)]),
      trustedOrigins: ORIGINS,
      handle,
      onReject,
    });
    return { handler, handle, onReject };
  }

  it('runs the handler with validated arguments from a trusted sender', async () => {
    const { handler } = makeHandler();
    await expect(handler(trusted, 'bob')).resolves.toBe('hello bob');
  });

  it.each([[[]], [[42]], [['way too long']], [['bob', 'extra']]])(
    'rejects malformed arguments %j without calling the handler',
    async (args) => {
      const { handler, handle, onReject } = makeHandler();
      await expect(handler(trusted, ...args)).rejects.toThrow('test.greet: invalid arguments');
      expect(handle).not.toHaveBeenCalled();
      expect(onReject).toHaveBeenCalledWith('test.greet', 'invalid arguments');
    },
  );

  it('rejects a foreign sender without calling the handler', async () => {
    const { handler, handle, onReject } = makeHandler();
    await expect(handler(eventFrom('file:///x.html'), 'bob')).rejects.toThrow('test.greet: untrusted sender');
    expect(handle).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledWith('test.greet', 'untrusted sender');
  });
});
