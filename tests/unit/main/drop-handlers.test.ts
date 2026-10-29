import { describe, expect, it } from 'vitest';
import { DropGrants } from '../../../src/core/documents/drops';
import { dropHandlers } from '../../../src/main/drops/handlers';
import type { WindowIpcEvent } from '../../../src/main/ipc/register';
import { FakeFileSystem } from '../../helpers/fakes';

const from = (id: number) => ({ sender: { id } }) as WindowIpcEvent;

function setup() {
  let n = 0;
  const fs = new FakeFileSystem({ '/d/a.md': '', '/d/b.bin': '\0', '/d/folder/c.md': '' });
  const sent: [number, { token: string; count: number }][] = [];
  const opened: [number, readonly string[], string | null | undefined][] = [];
  const scoped: [number, string][] = [];
  const handlers = dropHandlers({
    drops: new DropGrants(() => `drop-${++n}`),
    fs,
    received: (window, drop) => sent.push([window, drop]),
    open: async (window, files, after) => void opened.push([window, files, after]),
    searchFolder: (window, folder) => scoped.push([window, folder]),
  });
  return { handlers, sent, opened, scoped };
}

describe('dropHandlers', () => {
  it('tells the window a drop arrived by token and count, never its paths', async () => {
    const { handlers, sent } = setup();
    await handlers['drops.register']([['/d/a.md', '/d/b.bin']], from(1));
    expect(sent).toEqual([[1, { token: 'drop-1', count: 2 }]]);
  });

  it('opens the dropped files in order where the page says, once, in that window', async () => {
    const { handlers, opened } = setup();
    await handlers['drops.register']([['/d/b.bin', '/d/a.md', '/d/missing.md']], from(1));
    expect(await handlers['drops.open'](['drop-1', { after: 'tab-3' }], from(1))).toEqual({ folder: false });
    expect(opened).toEqual([[1, ['/d/b.bin', '/d/a.md', '/d/missing.md'], 'tab-3']]);
    await expect(async () => handlers['drops.open'](['drop-1', {}], from(1))).rejects.toThrow();
  });

  it('opens a dropped folder as a quick open search instead of a tab', async () => {
    const { handlers, opened, scoped } = setup();
    await handlers['drops.register']([['/d/folder', '/d/a.md']], from(1));
    expect(await handlers['drops.open'](['drop-1', {}], from(1))).toEqual({ folder: true });
    expect(opened).toEqual([[1, ['/d/a.md'], undefined]]);
    expect(scoped).toEqual([[1, '/d/folder']]);
  });

  it("refuses another window's drop, a made-up token, and relative paths", async () => {
    const { handlers, sent, opened } = setup();
    await handlers['drops.register']([['/d/a.md']], from(1));
    await expect(async () => handlers['drops.open'](['drop-1', {}], from(2))).rejects.toThrow();
    await expect(async () => handlers['drops.open'](['/etc/passwd', {}], from(1))).rejects.toThrow();
    await handlers['drops.register']([['a.md', '../x.md']], from(1));
    expect(sent).toHaveLength(1);
    expect(opened).toEqual([]);
  });
});
