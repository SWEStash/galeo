import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunningProfiles } from '../../../src/main/profiles/lifecycle';

afterEach(() => vi.restoreAllMocks());

/** A save the test lets land when it chooses. */
function deferred() {
  let resolve: () => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<void>((yes, no) => ((resolve = yes), (reject = no)));
  return { promise, resolve, reject };
}

function setup({ failStart = false } = {}) {
  const log: string[] = [];
  const saves = new Map<string, ReturnType<typeof deferred>>();
  const profiles = new RunningProfiles({
    create: async (id) => {
      log.push(`create ${id}`);
      return {
        id,
        has: (window: number) => window === (id === 'work' ? 2 : 1),
        stop: () => {
          const save = deferred();
          saves.set(id, save);
          return save.promise;
        },
        settings: {
          start: async () => {
            if (failStart) throw new Error('unreadable');
          },
          stop: () => void log.push(`settings stopped ${id}`),
        },
      };
    },
    changed: () => void log.push('changed'),
  });
  return { profiles, log, saves };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('RunningProfiles', () => {
  it('runs a started profile and finds it by window', async () => {
    const { profiles } = setup();
    const work = await profiles.start('work');
    expect(profiles.get('work')).toBe(work);
    expect(profiles.of(2)).toBe(work);
    expect(profiles.of(1)).toBeUndefined();
  });

  it("doesn't run a profile whose settings fail to start, and stops what they started", async () => {
    const { profiles, log } = setup({ failStart: true });
    await expect(profiles.start('work')).rejects.toThrow('unreadable');
    expect(profiles.has('work')).toBe(false);
    expect(log).toEqual(['create work', 'settings stopped work']);
  });

  it('starts a profile again only once its save on stopping has landed', async () => {
    const { profiles, log, saves } = setup();
    profiles.stop(await profiles.start('work'));
    expect(profiles.has('work')).toBe(false);
    const again = profiles.start('work');
    await settled();
    expect(log).toEqual(['create work', 'changed']);
    saves.get('work')!.resolve();
    await again;
    expect(log).toEqual(['create work', 'changed', 'create work']);
  });

  it('logs a failed save, and stops waiting for it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { profiles, saves } = setup();
    profiles.stop(await profiles.start('work'));
    saves.get('work')!.reject(new Error('disk full'));
    await profiles.stopped('work');
    expect(warn).toHaveBeenCalledWith('galeo: profile work not saved', expect.any(Error));
  });

  it('quits once every running profile is saved and the ones stopping have landed', async () => {
    const { profiles, saves } = setup();
    profiles.stop(await profiles.start('work'));
    await profiles.start('default');
    let quit = false;
    const quitting = profiles.quit().then(() => (quit = true));
    saves.get('default')!.resolve();
    await settled();
    expect(quit).toBe(false);
    saves.get('work')!.resolve();
    await quitting;
    expect(quit).toBe(true);
  });
});
