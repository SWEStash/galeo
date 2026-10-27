import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditGrants } from '../../../src/core/documents/edit-grants';
import { ReadIdentities } from '../../../src/core/documents/identities';
import { CrashRecovery } from '../../../src/core/tabs/crashes';
import { WarmTabs } from '../../../src/core/tabs/lifecycle';
import { TabRegistry } from '../../../src/core/tabs/registry';
import { windowCrashes } from '../../../src/main/window/crash';
import { FakeFileSystem } from '../../helpers/fakes';

afterEach(() => vi.restoreAllMocks());

function setup(forTests?: { crashOn: string }) {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  let n = 0;
  const tabs = new TabRegistry(() => `id-${++n}`);
  const a = tabs.open('/d/a.md', 1);
  const b = tabs.open('/d/b.md', 1);
  tabs.activate(b.id, 1);
  const warm = new WarmTabs({ count: 5, bytes: 1e9 });
  warm.activated(1, a.id);
  warm.activated(1, b.id);
  let time = 0;
  const crashes = new CrashRecovery(() => (time += 1000));
  const reloads: number[] = [];
  const killed: number[] = [];
  const seen: string[] = [];
  const window = { webContents: { id: 1, reload: () => void reloads.push(1) } };
  const recovery = windowCrashes({
    crashes,
    tabs,
    warm,
    reads: new ReadIdentities(new FakeFileSystem({})),
    grants: new EditGrants(),
    ...(forTests && { forTests: { crashOn: () => forTests.crashOn, seen: (path) => void seen.push(path), kill: (id) => void killed.push(id) } }),
  });
  return { tabs, warm, crashes, recovery, window, reloads, killed, seen, a, b };
}

describe('windowCrashes', () => {
  it('marks the tab that was rendering crashed and reloads the page with only the shown tab warm', () => {
    const { tabs, warm, recovery, window, reloads, a, b } = setup();
    recovery.reports.rendering(1, a.id);
    recovery.recover(window, 'crashed');
    expect(tabs.snapshot(1).tabs.find((tab) => tab.id === a.id)?.crashed).toBe(true);
    expect(warm.warm(1)).toEqual([b.id]);
    expect(reloads).toEqual([1]);
  });

  it('reloads without warming a tab once it gives up on the window, and stays down after that', () => {
    const { warm, crashes, recovery, window, reloads } = setup();
    vi.spyOn(crashes, 'crashed').mockReturnValueOnce({ tab: null, then: 'give-up' }).mockReturnValueOnce({ tab: null, then: 'stay-down' });
    recovery.recover(window, 'crashed');
    expect(warm.warm(1)).toEqual([]);
    recovery.recover(window, 'crashed');
    expect(reloads).toEqual([1]);
  });

  it('passes rendering reports straight through when not under test', () => {
    const { crashes, recovery } = setup();
    expect(recovery.reports).toBe(crashes);
  });

  it("under test, kills the window that starts rendering the named file and ignores its page's later reports", () => {
    const { crashes, recovery, killed, seen, a, b } = setup({ crashOn: '/d/b.md' });
    const rendered = vi.spyOn(crashes, 'rendered');
    recovery.reports.rendering(1, a.id);
    expect(killed).toEqual([]);
    recovery.reports.rendering(1, b.id);
    recovery.reports.rendered(1, b.id);
    expect(killed).toEqual([1]);
    expect(seen).toEqual(['/d/a.md', '/d/b.md']);
    expect(rendered).not.toHaveBeenCalled();
  });
});
