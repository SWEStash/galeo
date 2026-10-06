import { describe, expect, it } from 'vitest';
import { InputCredits } from '../../../src/core/documents/input-credits';
import { SelectionGrants } from '../../../src/core/documents/selections';
import { QuickOpen } from '../../../src/core/quick-open/session';
import type { WindowIpcEvent } from '../../../src/main/ipc/register';
import { quickOpenHandlers } from '../../../src/main/quick-open/handlers';
import { FakeClock, FakeFileSystem } from '../../helpers/fakes';

const from = (id: number) => ({ sender: { id } }) as WindowIpcEvent;

function setup() {
  let n = 0;
  const fs = new FakeFileSystem({ '/r/.git/HEAD': '', '/r/plan.md': '', '/r/notes.md': '' });
  const quickOpen = new QuickOpen({ fs, clock: new FakeClock(), grants: new SelectionGrants(() => `pick-${++n}`), home: '/home/me', onUpdate: () => {} });
  const opened: [number, string, boolean][] = [];
  const input = new InputCredits(() => 0);
  const handlers = quickOpenHandlers({
    quickOpen,
    input,
    request: (window) => (window === 9 ? null : { active: '/r/notes.md', tabs: ['/r/notes.md'], recent: [], exclude: [] }),
    open: (window, path, newWindow) => void opened.push([window, path, newWindow]),
  });
  return { quickOpen, handlers, opened, input };
}

describe('quickOpenHandlers', () => {
  it('starts on the sender window, and opens the chosen file there or in a new window', async () => {
    const { quickOpen, handlers, opened, input } = setup();
    const { token, scope } = await handlers['quickOpen.start']([], from(1));
    expect(scope).toBe('r (git root)');
    await quickOpen.walked(token);
    const results = await handlers['quickOpen.query']([token, 'plan'], from(1));
    const plan = results.sections.find((section) => section.kind === 'repo')!.entries[0]!;
    input.received(1);
    await handlers['quickOpen.open']([token, plan.id, false], from(1));
    expect(opened).toEqual([[1, '/r/plan.md', false]]);
  });

  it('closes once a file is opened, so its ids stop counting', async () => {
    const { handlers, opened, input } = setup();
    const { token } = await handlers['quickOpen.start']([], from(1));
    const tab = (await handlers['quickOpen.query']([token, ''], from(1))).sections[0]!.entries[0]!;
    input.received(1);
    input.received(1);
    await handlers['quickOpen.open']([token, tab.id, true], from(1));
    await expect(async () => handlers['quickOpen.open']([token, tab.id, true], from(1))).rejects.toThrow();
    expect(opened).toEqual([[1, '/r/notes.md', true]]);
  });

  it("refuses a path, another window's id, or a closed session's", async () => {
    const { handlers, opened, input } = setup();
    const { token } = await handlers['quickOpen.start']([], from(1));
    const tab = (await handlers['quickOpen.query']([token, ''], from(1))).sections[0]!.entries[0]!;
    for (let n = 0; n < 4; n++) input.received(1), input.received(2);
    await expect(async () => handlers['quickOpen.open']([token, '/etc/passwd', false], from(1))).rejects.toThrow();
    await expect(async () => handlers['quickOpen.open']([token, tab.id, false], from(2))).rejects.toThrow();
    await handlers['quickOpen.close']([token], from(1));
    await expect(async () => handlers['quickOpen.open']([token, tab.id, false], from(1))).rejects.toThrow();
    expect(opened).toEqual([]);
  });

  it('answers a window main knows nothing of with empty results', async () => {
    const { handlers } = setup();
    const { token, scope } = await handlers['quickOpen.start']([], from(9));
    expect(scope).toBeNull();
    expect((await handlers['quickOpen.query']([token, 'plan'], from(9))).sections).toEqual([]);
  });

  it('lists a typed folder only right after real input, once per input', async () => {
    const { handlers, input } = setup();
    const { token } = await handlers['quickOpen.start']([], from(1));
    expect((await handlers['quickOpen.query']([token, '/r/'], from(1))).sections).toEqual([]);
    input.received(1);
    const listed = await handlers['quickOpen.query']([token, '/r/'], from(1));
    expect(listed.sections[0]!.entries.map((entry) => entry.name)).toContain('plan.md');
    expect((await handlers['quickOpen.query']([token, '/r/p'], from(1))).sections).toEqual([]);
    // A name search reaches only what the window was given: no input needed.
    expect((await handlers['quickOpen.query']([token, 'notes'], from(1))).sections).not.toEqual([]);
  });

  it('opens a chosen file only right after real input', async () => {
    const { handlers, opened, input } = setup();
    const { token } = await handlers['quickOpen.start']([], from(1));
    const tab = (await handlers['quickOpen.query']([token, ''], from(1))).sections[0]!.entries[0]!;
    await expect(async () => handlers['quickOpen.open']([token, tab.id, false], from(1))).rejects.toThrow();
    input.received(1);
    await handlers['quickOpen.open']([token, tab.id, false], from(1));
    expect(opened).toEqual([[1, '/r/notes.md', false]]);
  });
});
