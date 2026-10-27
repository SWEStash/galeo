import { describe, expect, it } from 'vitest';
import type { WindowIpcEvent } from '../../../src/main/ipc/register';
import { windowHandlers } from '../../../src/main/window/handlers';

const from = (id: number) => ({ sender: { id } }) as WindowIpcEvent;

function setup(retries: boolean) {
  const calls: string[] = [];
  const handlers = windowHandlers({
    windowOf: (window) => (window === 1 ? 'w1' : undefined),
    command: (command, window) => void calls.push(`${command} ${window}`),
    crashes: { retry: (window) => (calls.push(`retry ${window}`), retries) },
    reload: (window) => void calls.push(`reload ${window}`),
  });
  return { handlers, calls };
}

describe('windowHandlers', () => {
  it("runs a command on the sender's window, and nothing for a window with no profile", async () => {
    const { handlers, calls } = setup(true);
    await handlers['window.command'](['fullScreen'], from(1));
    await handlers['window.command'](['quit'], from(2));
    expect(calls).toEqual(['fullScreen w1']);
  });

  it('reloads after crashes only while the window shows the crash loop', async () => {
    const shown = setup(true);
    await shown.handlers['window.retryAfterCrashes']([], from(1));
    expect(shown.calls).toEqual(['retry 1', 'reload w1']);
    const notShown = setup(false);
    await expect(async () => notShown.handlers['window.retryAfterCrashes']([], from(1))).rejects.toThrow('crash loop');
    await expect(async () => notShown.handlers['window.retryAfterCrashes']([], from(2))).rejects.toThrow('crash loop');
    expect(notShown.calls).toEqual(['retry 1']);
  });
});
