import { describe, expect, it } from 'vitest';
import { EditGrants } from '../../../src/core/documents/edit-grants';
import { CrashRecovery } from '../../../src/core/tabs/crashes';
import { WarmTabs } from '../../../src/core/tabs/lifecycle';
import { TabRegistry } from '../../../src/core/tabs/registry';
import { tabMover } from '../../../src/main/tabs/transfer';

const MB = 1024 * 1024;

function setup() {
  let n = 0;
  const grants = new EditGrants();
  const tabs = new TabRegistry(
    () => `id-${++n}`,
    // As main does on every change: grants follow what each window shows.
    (window) => grants.sync(window, tabs.list(window)),
  );
  const warm = new WarmTabs({ count: 1, bytes: 10 * MB });
  const crashes = new CrashRecovery(() => 0);
  const demoted: [number, string[]][] = [];
  const emptied: number[] = [];
  const move = tabMover({ tabs, grants, warm, crashes, demote: (window, ids) => demoted.push([window, ids]), emptied: (window) => emptied.push(window) });
  return { tabs, grants, warm, crashes, demoted, emptied, move };
}

describe('tabMover (ADR-019)', () => {
  it('moves the tab with its edit grant and unsaved text, which the window it left no longer has', () => {
    const { tabs, grants, move } = setup();
    const a = tabs.open('/d/a.md', 1).id;
    tabs.open('/d/b.md', 1);
    grants.grant(a, 1, '/d/a.md');
    grants.keep(a, 1, '# mine', 'v1');

    expect(move(a, 1, 2, 0)).toBe(true);

    expect(tabs.list(2).map((tab) => tab.id)).toEqual([a]);
    expect(grants.allows(a, 2, '/d/a.md')).toBe(true);
    expect(grants.kept(a, 2)).toEqual({ text: '# mine', base: 'v1' });
    expect(grants.dirty(1)).toEqual([]);
  });

  it("makes the tab the destination's shown tab in its warm set, hibernating what that pushes out", () => {
    const { tabs, warm, demoted, move } = setup();
    const a = tabs.open('/d/a.md', 1).id;
    tabs.open('/d/b.md', 1);
    const x = tabs.open('/d/x.md', 2).id;
    const y = tabs.open('/d/y.md', 2).id;
    warm.activated(2, x);
    warm.activated(2, y);
    warm.activated(1, a);

    move(a, 1, 2, 0);

    expect(warm.warm(1)).toEqual([]);
    expect(warm.warm(2)[0]).toBe(a);
    expect(demoted).toEqual([[2, [x]]]);
  });

  it("clears the window's crash breadcrumb when it named the tab that left", () => {
    const { tabs, crashes, move } = setup();
    const a = tabs.open('/d/a.md', 1).id;
    tabs.open('/d/b.md', 1);
    crashes.rendering(1, a);
    move(a, 1, 2, 0);
    expect(crashes.crashed(1).tab).toBeNull();
  });

  it('says the window it left is empty when its last tab went', () => {
    const { tabs, emptied, move } = setup();
    const a = tabs.open('/d/a.md', 1).id;
    const b = tabs.open('/d/b.md', 1).id;
    move(a, 1, 2, 0);
    expect(emptied).toEqual([]);
    move(b, 1, 2, 1);
    expect(emptied).toEqual([1]);
  });

  it("refuses the settings tab, another window's tab and its own window, changing nothing", () => {
    const { tabs, grants, emptied, move } = setup();
    const a = tabs.open('/d/a.md', 1).id;
    const settings = tabs.openSettings(1).id;
    grants.grant(a, 1, '/d/a.md');
    expect(move(settings, 1, 2, 0)).toBe(false);
    expect(move(a, 3, 2, 0)).toBe(false);
    expect(move(a, 1, 1, 0)).toBe(false);
    expect(tabs.list(1).map((tab) => tab.id)).toEqual([a, settings]);
    expect(grants.allows(a, 1, '/d/a.md')).toBe(true);
    expect(emptied).toEqual([]);
  });
});
