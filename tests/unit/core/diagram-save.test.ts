import { describe, expect, it } from 'vitest';
import { DIAGRAM_MAX_BYTES, DiagramSaves, diagramFileName } from '../../../src/core/documents/diagram-save';
import { utf8 } from '../../../src/main/adapters/utf8';
import { FakeFileSystem } from '../../helpers/fakes';

function setup({ credits = 1, picked = '/home/me/Documents/flow.svg' as string | null } = {}) {
  const fs = new FakeFileSystem({ '/home/me/Documents/.keep': '', '/d/.keep': '' });
  const asked: [number, string, string][] = [];
  let left = credits;
  let now = 0;
  let n = 0;
  const saves = new DiagramSaves({
    fs,
    encode: (text) => utf8.encode(text),
    input: { spend: () => left-- > 0 },
    askPath: async (window, suggested, format) => (asked.push([window, suggested, format]), picked),
    randomId: () => `token-${++n}`,
    now: () => now,
  });
  const read = async (path: string) => new TextDecoder().decode(await fs.readFile(path, { maxBytes: 1e6 }));
  return { fs, saves, asked, read, later: (ms: number) => (now += ms) };
}

describe('DiagramSaves (#59)', () => {
  it('asks where on the click, suggesting a name from the diagram, then writes only the picked path, once', async () => {
    const { saves, asked, read, fs } = setup();
    const token = await saves.choose(1, 'svg', 'Login flow');
    expect(asked).toEqual([[1, 'Login flow.svg', 'svg']]);
    expect(await saves.write(1, token!, '<svg/>')).toBe('saved');
    expect(await read('/home/me/Documents/flow.svg')).toBe('<svg/>');
    // As a document save writes (SR-15): no forced mode, and an existing file keeps its own.
    expect(fs.saves).toEqual(['/home/me/Documents/flow.svg']);
    expect(await saves.write(1, token!, '<svg/>')).toBe('refused');
  });

  it('writes a PNG the page drew after the click, however long it took within a minute', async () => {
    const { saves, fs, later } = setup({ picked: '/d/flow.png' });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const token = await saves.choose(1, 'png', 'flow');
    later(5000);
    expect(await saves.write(1, token!, png)).toBe('saved');
    expect([...(await fs.readFile('/d/flow.png', { maxBytes: 10 }))]).toEqual([...png]);
  });

  it('writes through a symlink the reader picked, to the file it points to', async () => {
    const { saves, fs, read } = setup({ picked: '/home/me/Documents/link.svg' });
    fs.symlink('/home/me/Documents/link.svg', '/home/me/Documents/real.svg');
    expect(await saves.write(1, (await saves.choose(1, 'svg', 'flow'))!, '<svg/>')).toBe('saved');
    expect(fs.saves).toEqual(['/home/me/Documents/real.svg']);
    expect(await read('/home/me/Documents/real.svg')).toBe('<svg/>');
  });

  it('gives no token without real input or when the reader cancels', async () => {
    expect(await setup({ credits: 0 }).saves.choose(1, 'svg', 'flow')).toBeNull();
    expect(await setup({ picked: null }).saves.choose(1, 'svg', 'flow')).toBeNull();
  });

  it("refuses another window's or an unknown token, a late one, data not of the chosen format, empty or too large", async () => {
    const cases: [string, (saves: DiagramSaves, token: string, later: (ms: number) => void) => Promise<string>][] = [
      ['another window', (saves, token) => saves.write(2, token, '<svg/>')],
      ['unknown', (saves) => saves.write(1, 'made-up', '<svg/>')],
      ['late', (saves, token, later) => (later(60_001), saves.write(1, token, '<svg/>'))],
      ['bytes for an SVG', (saves, token) => saves.write(1, token, new Uint8Array([1]))],
      ['empty', (saves, token) => saves.write(1, token, '')],
      ['too large', (saves, token) => saves.write(1, token, 'x'.repeat(DIAGRAM_MAX_BYTES + 1))],
    ];
    for (const [, write] of cases) {
      const { saves, fs, later } = setup();
      const token = (await saves.choose(1, 'svg', 'flow'))!;
      expect(await write(saves, token, later)).toBe('refused');
      expect(fs.saves).toEqual([]);
    }
  });

  it('suggests a plain file name: no folders or control characters, never empty or hidden', () => {
    expect(diagramFileName('../../etc/passwd', 'svg')).toBe('etc passwd.svg');
    expect(diagramFileName('a\u0000b:c', 'png')).toBe('a b c.png');
    expect(diagramFileName('   ', 'svg')).toBe('diagram.svg');
    expect(diagramFileName('.hidden', 'svg')).toBe('hidden.svg');
    expect(diagramFileName('x'.repeat(200), 'svg')).toHaveLength(84);
  });
});
