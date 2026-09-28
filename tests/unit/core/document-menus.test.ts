import { describe, expect, it } from 'vitest';
import { DocumentMenus } from '../../../src/core/documents/menus';
import { TabRegistry } from '../../../src/core/tabs/registry';
import type { MenuItem } from '../../../src/core/ports';
import { FakeOsShell } from '../../helpers/fakes';

function setup(choice: string | null) {
  let n = 0;
  const tabs = new TabRegistry(() => `id-${++n}`);
  const shell = new FakeOsShell();
  const copied: string[] = [];
  const shown: { window: number; items: readonly MenuItem[] }[] = [];
  const menus = new DocumentMenus({
    tabs,
    shell,
    clipboard: { writeText: (text) => copied.push(text) },
    showMenu: async (window, items) => (shown.push({ window, items }), choice),
  });
  const { id } = tabs.open('/d/plans/plan.md', 1);
  return { menus, shell, copied, shown, id };
}

describe('DocumentMenus.path', () => {
  it("offers to copy the tab's path or reveal it in the file manager, as a native menu", async () => {
    const { menus, shown, id } = setup(null);
    await menus.path(id, 1);
    expect(shown).toEqual([
      {
        window: 1,
        items: [
          { id: 'copy-path', label: 'Copy path' },
          { id: 'reveal', label: 'Reveal in Files' },
        ],
      },
    ]);
  });

  it('copies the path main holds for the tab', async () => {
    const { menus, copied, shell, id } = setup('copy-path');
    await menus.path(id, 1);
    expect(copied).toEqual(['/d/plans/plan.md']);
    expect(shell.calls).toEqual([]);
  });

  it('reveals the file in the file manager', async () => {
    const { menus, shell, id } = setup('reveal');
    await menus.path(id, 1);
    expect(shell.calls).toEqual([{ method: 'revealInFileManager', target: '/d/plans/plan.md' }]);
  });

  it("refuses another window's tab, showing nothing", async () => {
    const { menus, shown, id } = setup('reveal');
    await expect(menus.path(id, 2)).rejects.toThrow();
    expect(shown).toEqual([]);
  });
});
