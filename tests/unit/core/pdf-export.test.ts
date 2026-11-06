import { describe, expect, it } from 'vitest';
import { PdfExports, pdfName } from '../../../src/core/documents/pdf-export';
import { FakeFileSystem } from '../../helpers/fakes';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

function setup({ credits = 1, picked = '/d/notes.pdf' as string | null } = {}) {
  const fs = new FakeFileSystem({ '/d/.keep': '' });
  let now = 0;
  let n = 0;
  let left = credits;
  const asked: [number, string][] = [];
  const printed: number[] = [];
  const exports = new PdfExports({
    fs,
    askPath: async (window, suggested) => (asked.push([window, suggested]), picked),
    print: async (window) => (printed.push(window), PDF),
    input: { spend: () => left-- > 0 },
    randomId: () => `token-${++n}`,
    now: () => now,
  });
  return { fs, exports, asked, printed, later: (ms: number) => (now += ms) };
}

describe('PdfExports (#56)', () => {
  it("asks where, then prints the window into the picked file, once per token", async () => {
    const { exports, asked, printed, fs } = setup();
    const token = await exports.choose(1, 'notes.md');
    expect(asked).toEqual([[1, 'notes.pdf']]);
    expect(await exports.print(1, token!)).toBe('saved');
    expect([...(await fs.readFile('/d/notes.pdf', { maxBytes: 10 }))]).toEqual([...PDF]);
    expect(printed).toEqual([1]);
    expect(await exports.print(1, token!)).toBe('refused');
  });

  it('gives nothing without real input or when the reader cancels', async () => {
    expect(await setup({ credits: 0 }).exports.choose(1, 'notes.md')).toBeNull();
    expect(await setup({ picked: null }).exports.choose(1, 'notes.md')).toBeNull();
  });

  it("refuses another window's token, an unknown one, or one left too long", async () => {
    const { exports, printed, later } = setup();
    const token = (await exports.choose(1, 'notes.md'))!;
    expect(await exports.print(2, token)).toBe('refused');
    expect(await exports.print(1, 'made-up')).toBe('refused');
    const { exports: slow, later: wait } = setup();
    const old = (await slow.choose(1, 'notes.md'))!;
    wait(60_001);
    expect(await slow.print(1, old)).toBe('refused');
    later(0);
    expect(printed).toEqual([]);
  });

  it('names the PDF after the file', () => {
    expect(pdfName('notes.md')).toBe('notes.pdf');
    expect(pdfName('archive.tar.gz')).toBe('archive.tar.pdf');
    expect(pdfName('README')).toBe('README.pdf');
    expect(pdfName('.md')).toBe('document.pdf');
  });
});
