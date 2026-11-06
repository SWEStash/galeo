import { describe, expect, it } from 'vitest';
import { DIAGRAM_MAX_BYTES, DiagramSaves, diagramFileName } from '../../../src/core/documents/diagram-save';
import { utf8 } from '../../../src/main/adapters/utf8';
import { FakeFileSystem } from '../../helpers/fakes';

function setup({ credits = 1, picked = '/home/me/Documents/flow.svg' as string | null } = {}) {
  const fs = new FakeFileSystem({ '/home/me/Documents/.keep': '', '/d/.keep': '' });
  const asked: [number, string, string][] = [];
  let left = credits;
  const saves = new DiagramSaves({
    fs,
    encode: (text) => utf8.encode(text),
    input: { spend: () => left-- > 0 },
    askPath: async (window, suggested, format) => (asked.push([window, suggested, format]), picked),
  });
  const read = async (path: string) => new TextDecoder().decode(await fs.readFile(path, { maxBytes: 1e6 }));
  return { fs, saves, asked, read };
}

describe('DiagramSaves (#59)', () => {
  it('asks where, suggesting a name from the diagram, and writes only the picked path', async () => {
    const { saves, asked, read, fs } = setup();
    expect(await saves.save(1, 'svg', '<svg/>', 'Login flow')).toBe('saved');
    expect(asked).toEqual([[1, 'Login flow.svg', 'svg']]);
    expect(await read('/home/me/Documents/flow.svg')).toBe('<svg/>');
    expect(fs.modeOf('/home/me/Documents/flow.svg')).toBe(0o644);
  });

  it('writes a PNG as the bytes the page drew', async () => {
    const { saves, fs } = setup({ picked: '/d/flow.png' });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    expect(await saves.save(1, 'png', png, 'flow')).toBe('saved');
    expect([...(await fs.readFile('/d/flow.png', { maxBytes: 10 }))]).toEqual([...png]);
  });

  it('writes nothing when the reader cancels', async () => {
    const { saves, fs } = setup({ picked: null });
    expect(await saves.save(1, 'svg', '<svg/>', 'flow')).toBe('cancelled');
    await expect(fs.stat('/home/me/Documents/flow.svg')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses without real input, a format that does not match its data, empty or too large, before asking', async () => {
    for (const [credits, format, data] of [
      [0, 'svg', '<svg/>'],
      [1, 'svg', new Uint8Array([1])],
      [1, 'png', '<svg/>'],
      [1, 'svg', ''],
      [1, 'png', new Uint8Array(DIAGRAM_MAX_BYTES + 1)],
    ] as const) {
      const { saves, asked } = setup({ credits });
      expect(await saves.save(1, format, data, 'flow')).toBe('refused');
      expect(asked).toEqual([]);
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
