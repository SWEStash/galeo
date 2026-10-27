import { describe, expect, it } from 'vitest';
import { InputCredits } from '../../../src/core/documents/input-credits';
import type { WindowIpcEvent } from '../../../src/main/ipc/register';
import { profileHandlers } from '../../../src/main/profiles/handlers';

const from = (id: number) => ({ sender: { id } }) as WindowIpcEvent;

function setup({ confirmed = true } = {}) {
  const calls: string[] = [];
  const profiles = new Map([
    [1, { id: 'default', windows: [{ webContents: { id: 1 } }] }],
    [2, { id: 'work', windows: [{ webContents: { id: 2 } }, { webContents: { id: 3 } }] }],
  ]);
  profiles.set(3, profiles.get(2)!);
  const asked: (readonly number[])[] = [];
  const input = new InputCredits(() => 0);
  const handlers = profileHandlers({
    profileOf: (window) => profiles.get(window),
    state: async (current) => ({ current, profiles: [] }),
    profileIds: async () => ['default', 'work'],
    enqueue: async (task) => (calls.push('queued'), task()),
    open: async (id) => void calls.push(`open ${id}`),
    create: async (name) => (calls.push(`create ${name}`), { ok: true }),
    update: async (profile, name) => (calls.push(`update ${profile.id} ${name}`), { ok: true }),
    remove: async (id) => void calls.push(`remove ${id}`),
    undoable: new Map([['undo-1', { name: 'Work', window: 2 }]]),
    undo: async (token) => void calls.push(`undo ${token}`),
    input,
    unsaved: { confirm: async (windows) => (asked.push(windows), confirmed) },
  });
  return { handlers, calls, asked, input };
}

describe('profileHandlers', () => {
  it("lists profiles with the sender's as current, the default one for a window with none", async () => {
    const { handlers } = setup();
    expect((await handlers['profiles.list']([], from(2))).current).toBe('work');
    expect((await handlers['profiles.list']([], from(9))).current).toBe('default');
  });

  it('opens, creates and updates on the routing queue', async () => {
    const { handlers, calls } = setup();
    await handlers['profiles.open'](['work'], from(1));
    await handlers['profiles.create'](['Notes', null], from(1));
    await handlers['profiles.update'](['Job', null], from(3));
    expect(calls).toEqual(['queued', 'open work', 'queued', 'create Notes', 'queued', 'update work Job']);
  });

  it('refuses to open a profile that does not exist, or to update from a window with no profile', async () => {
    const { handlers, calls } = setup();
    await expect(async () => handlers['profiles.open'](['gone'], from(1))).rejects.toThrow('no such profile');
    await expect(async () => handlers['profiles.update'](['Job', null], from(9))).rejects.toThrow('no profile');
    expect(calls).toEqual([]);
  });

  it("deletes the sender's profile only on real input, after asking about unsaved changes in all its windows", async () => {
    const { handlers, calls, asked, input } = setup();
    await expect(async () => handlers['profiles.delete']([], from(2))).rejects.toThrow('no input');
    input.received(2);
    await handlers['profiles.delete']([], from(2));
    expect(asked).toEqual([[2, 3]]);
    expect(calls).toEqual(['queued', 'remove work']);
  });

  it('keeps the profile when the reader cancels, and never deletes the default one', async () => {
    const kept = setup({ confirmed: false });
    kept.input.received(2);
    await kept.handlers['profiles.delete']([], from(2));
    expect(kept.calls).toEqual([]);
    const { handlers, input } = setup();
    input.received(1);
    await expect(async () => handlers['profiles.delete']([], from(1))).rejects.toThrow('not deletable');
  });

  it('offers an undo only to the window that saw the profile created', async () => {
    const { handlers, calls } = setup();
    expect(await handlers['profiles.created']([], from(2))).toEqual({ name: 'Work', token: 'undo-1' });
    expect(await handlers['profiles.created']([], from(1))).toBeNull();
    await expect(async () => handlers['profiles.undoCreate'](['undo-1'], from(1))).rejects.toThrow('not offered');
    await handlers['profiles.undoCreate'](['undo-1'], from(2));
    expect(calls).toEqual(['queued', 'undo undo-1']);
  });
});
