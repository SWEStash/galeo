import { describe, expect, it, vi } from 'vitest';
import { DocumentMenus } from '../../../src/core/documents/menus';
import { TabRegistry } from '../../../src/core/tabs/registry';
import type { MenuItem } from '../../../src/core/ports';
import { FakeFileSystem, FakeOsShell } from '../../helpers/fakes';

function setup(
  choice: string | null,
  files: Record<string, string> = { '/d/plans/plan.md': '# plan' },
  answer?: () => Promise<string | null>,
) {
  let n = 0;
  const tabs = new TabRegistry(() => `id-${++n}`);
  const shell = new FakeOsShell();
  const fs = new FakeFileSystem(files);
  const copied: string[] = [];
  const shown: { window: number; items: readonly MenuItem[] }[] = [];
  const menus = new DocumentMenus({
    tabs,
    fs,
    shell,
    clipboard: { writeText: (text) => copied.push(text) },
    showMenu: async (window, items) => (shown.push({ window, items }), answer ? answer() : choice),
  });
  const { id } = tabs.open(Object.keys(files)[0] ?? '/d/gone.md', 1);
  return { menus, shell, fs, copied, shown, id };
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

describe('DocumentMenus.document (SR-05)', () => {
  it('offers to open a plain document with the default app, reveal it or copy its path, and opens it on choice', async () => {
    const { menus, shell, shown, id } = setup('open-default');
    await menus.document(id, 1);
    expect(shown[0]!.items).toEqual([
      { id: 'open-default', label: 'Open with default app', enabled: true },
      { id: 'reveal', label: 'Reveal in Files' },
      { id: 'copy-path', label: 'Copy path' },
    ]);
    expect(shell.calls).toEqual([{ method: 'openPath', target: '/d/plans/plan.md' }]);
  });

  it.each([
    ['an executable file', { '/d/tool': '#!/bin/sh' }, true],
    ['a launcher', { '/d/app.desktop': '[Desktop Entry]' }, false],
    ['a missing file', {}, false],
  ] as const)('never opens %s, even when the choice comes back', async (_name, files, executable) => {
    const { menus, shell, shown, fs, id } = setup('open-default', files);
    for (const path of Object.keys(files)) if (executable) fs.makeExecutable(path);
    await menus.document(id, 1);
    expect(shown[0]!.items[0]).toMatchObject({ id: 'open-default', enabled: false });
    expect(shell.calls).toEqual([]);
  });

  it('never opens a document that is a symlink to a launcher', async () => {
    const { menus, shell, shown, fs, id } = setup('open-default', { '/d/notes.md': '# notes', '/d/run.sh': 'echo' });
    fs.delete('/d/notes.md');
    fs.symlink('/d/notes.md', '/d/run.sh');
    await menus.document(id, 1);
    expect(shown[0]!.items[0]).toMatchObject({ id: 'open-default', enabled: false });
    expect(shell.calls).toEqual([]);
  });

  it('checks the file again when the choice comes, not only when the menu opened', async () => {
    let choose: ((id: string | null) => void) | undefined;
    const { menus, shell, fs, id } = setup(null, undefined, () => new Promise((resolve) => (choose = resolve)));
    const done = menus.document(id, 1);
    await vi.waitFor(() => expect(choose).toBeDefined());
    fs.makeExecutable('/d/plans/plan.md');
    choose!('open-default');
    await done;
    expect(shell.calls).toEqual([]);
  });

  it("refuses another window's tab", async () => {
    const { menus, shown, id } = setup('open-default');
    await expect(menus.document(id, 2)).rejects.toThrow();
    expect(shown).toEqual([]);
  });
});
