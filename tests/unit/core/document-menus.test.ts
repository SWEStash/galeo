import { describe, expect, it, vi } from 'vitest';
import { DocumentMenus } from '../../../src/core/documents/menus';
import { TabRegistry } from '../../../src/core/tabs/registry';
import type { MenuItem } from '../../../src/core/ports';
import { FakeFileSystem, FakeOsShell } from '../../helpers/fakes';

function setup(
  choice: string | null,
  files: Record<string, string> = { '/d/plans/plan.md': '# plan' },
  platform = 'linux',
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
    platform,
  });
  const { id } = tabs.open(Object.keys(files)[0] ?? '/d/gone.md', 1);
  return { menus, tabs, shell, fs, copied, shown, id };
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

  it('on Windows offers it only for a known document type (ADR-028)', async () => {
    const { menus, shell, shown, id } = setup('open-default', { '/d/page.html': '<p>' }, 'win32');
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
    const { menus, shell, fs, id } = setup(null, undefined, undefined, () => new Promise((resolve) => (choose = resolve)));
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

describe('DocumentMenus.tab (UX F4)', () => {
  const entries = (shown: { items: readonly MenuItem[] }[]) => shown[0]!.items.map((item) => `${item.label}${item.enabled === false ? ' (off)' : ''}`);

  it('lists the tab commands, Reopen only when something closed and the moves only with another tab', async () => {
    const { menus, shown, id } = setup(null);
    expect(await menus.tab(id, 1, { canReopen: false })).toBeNull();
    expect(entries(shown)).toEqual(['Close tab', 'Reopen closed tab (off)', 'Move to new window (off)', 'Move to window… (off)', 'Copy path', 'Reveal in Files', 'Pin tab']);
  });

  it('offers Unpin on a pinned tab, and nothing but Close and Reopen on the Settings tab', async () => {
    const pinned = setup(null);
    pinned.tabs.open('/d/other.md', 1);
    pinned.tabs.setPinned(pinned.id, 1, true);
    await pinned.menus.tab(pinned.id, 1, { canReopen: true });
    expect(entries(pinned.shown)).toEqual(['Close tab', 'Reopen closed tab', 'Move to new window', 'Move to window…', 'Copy path', 'Reveal in Files', 'Unpin tab']);

    const settings = setup(null);
    const tab = settings.tabs.openSettings(1);
    await settings.menus.tab(tab.id, 1, { canReopen: false });
    expect(entries(settings.shown)).toEqual(['Close tab', 'Reopen closed tab (off)', 'Move to new window (off)', 'Move to window… (off)', 'Copy path (off)', 'Reveal in Files (off)', 'Pin tab (off)']);
  });

  it('copies the path and reveals the file itself, and hands the other choices to the page', async () => {
    const copy = setup('copy-path');
    expect(await copy.menus.tab(copy.id, 1, { canReopen: false })).toBeNull();
    expect(copy.copied).toEqual(['/d/plans/plan.md']);
    const reveal = setup('reveal');
    expect(await reveal.menus.tab(reveal.id, 1, { canReopen: false })).toBeNull();
    expect(reveal.shell.calls).toEqual([{ method: 'revealInFileManager', target: '/d/plans/plan.md' }]);
    for (const choice of ['close', 'reopen', 'move-new', 'move-to', 'pin'] as const) {
      const each = setup(choice);
      expect(await each.menus.tab(each.id, 1, { canReopen: true })).toBe(choice);
    }
  });

  it('does nothing when the tab closed while its menu was open', async () => {
    let close = () => {};
    const { menus, tabs, copied, id } = setup(null, undefined, 'linux', async () => (close(), 'copy-path'));
    close = () => void tabs.close(id, 1);
    expect(await menus.tab(id, 1, { canReopen: false })).toBeNull();
    expect(copied).toEqual([]);
  });
});
