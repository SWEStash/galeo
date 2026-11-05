import { describe, expect, it } from 'vitest';
import { toggleTaskBox } from '../../../src/core/documents/task-boxes';
import type { Decode } from '../../../src/core/text/decode';
import { extractReferences, type References } from '../../../src/shared/markdown/references';
import { FakeFileSystem } from '../../helpers/fakes/file-system';

const decode: Decode = (bytes, encoding, { fatal }) => new TextDecoder(encoding, { fatal, ignoreBOM: true }).decode(bytes);
const hash = (bytes: Uint8Array) => `#${[...bytes].join('.')}`;
const utf8 = (text: string) => new TextEncoder().encode(text);
const extract = async (text: string) => extractReferences(text);
const textOf = async (fs: FakeFileSystem) => new TextDecoder().decode(await fs.readFile('/d/plan.md', { maxBytes: 1 << 20 }));

function toggle(fs: FakeFileSystem, line: number, base: string, references: (text: string) => Promise<References | null> = extract) {
  return toggleTaskBox({ fs, decode, hash, references }, { path: '/d/plan.md', line, base, format: 'markdown' });
}

describe('toggleTaskBox', () => {
  it("flips a task item's box both ways, keeping the file's line endings, and names the new version", async () => {
    const text = '# Plan\r\n\r\n- [ ] one\r\n- [x] two\r\n';
    const fs = new FakeFileSystem({ '/d/plan.md': text });
    const ticked = '# Plan\r\n\r\n- [x] one\r\n- [x] two\r\n';
    expect(await toggle(fs, 3, hash(utf8(text)))).toEqual({ kind: 'saved', version: hash(utf8(ticked)) });
    expect(await textOf(fs)).toBe(ticked);
    expect(await toggle(fs, 4, hash(utf8(ticked)))).toMatchObject({ kind: 'saved' });
    expect(await textOf(fs)).toBe('# Plan\r\n\r\n- [x] one\r\n- [ ] two\r\n');
  });

  it('writes nothing when the file changed since the page read it', async () => {
    const fs = new FakeFileSystem({ '/d/plan.md': '- [ ] theirs\n' });
    expect(await toggle(fs, 1, hash(utf8('- [ ] mine\n')))).toEqual({ kind: 'conflict', version: hash(utf8('- [ ] theirs\n')) });
    expect(fs.saves).toEqual([]);
  });

  it("refuses a line main's own parse doesn't show as a task item: a box in a code block, a heading, past the end", async () => {
    const text = '# Plan\n\n```md\n- [ ] in code\n```\n';
    const fs = new FakeFileSystem({ '/d/plan.md': text });
    for (const line of [1, 4, 99]) expect(await toggle(fs, line, hash(utf8(text)))).toEqual({ kind: 'refused', reason: 'not-a-task' });
    expect(fs.saves).toEqual([]);
  });

  it("refuses when a line the parse calls a task item doesn't start with a box (raw HTML)", async () => {
    const text = '<ul><li><input type="checkbox"> raw</li></ul>\n';
    const fs = new FakeFileSystem({ '/d/plan.md': text });
    const claims = async () => ({ links: [], images: [], tasks: [1] });
    expect(await toggle(fs, 1, hash(utf8(text)), claims)).toEqual({ kind: 'refused', reason: 'not-a-task' });
    expect(fs.saves).toEqual([]);
  });

  it("refuses when main couldn't parse the file in time", async () => {
    const text = '- [ ] one\n';
    const fs = new FakeFileSystem({ '/d/plan.md': text });
    expect(await toggle(fs, 1, hash(utf8(text)), async () => null)).toEqual({ kind: 'refused', reason: 'unavailable' });
    expect(fs.saves).toEqual([]);
  });
});
