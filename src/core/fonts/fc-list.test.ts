import { describe, expect, it } from 'vitest';
import { FC_LIST_FORMAT, parseFontList } from './fc-list';

describe('parseFontList', () => {
  it('lists each family once, sorted, monospace when any of its faces is', () => {
    const output = ['DejaVu Sans\t', 'DejaVu Sans Mono\t100', 'DejaVu Sans\t', 'Fira Code\t90', 'Fira Code\t', 'Cousine\t110', 'Arial\t0', ''].join('\n');
    expect(parseFontList(output)).toEqual([
      { family: 'Arial', mono: false },
      { family: 'Cousine', mono: true },
      { family: 'DejaVu Sans', mono: false },
      { family: 'DejaVu Sans Mono', mono: true },
      { family: 'Fira Code', mono: true },
    ]);
  });

  it('sorts by name the way a reader reads it, ignoring case', () => {
    expect(parseFontList('noto Serif\t\nLato\t\nb612\t\n').map((font) => font.family)).toEqual(['b612', 'Lato', 'noto Serif']);
  });

  it('drops names a setting could not hold: empty, over 100 characters, or with control characters', () => {
    const output = ['\t100', '   \t', `${'x'.repeat(101)}\t`, 'Bad\u0007Bell\t', 'Bad\u001bEsc\t', `${'y'.repeat(100)}\t`, ' Spaced  Out \t'].join('\n');
    expect(parseFontList(output)).toEqual([
      { family: 'Spaced  Out', mono: false },
      { family: 'y'.repeat(100), mono: false },
    ]);
  });

  it('keeps quotes and other punctuation as data: the tokens escape them', () => {
    expect(parseFontList("O'Brien Sans\t\n")).toEqual([{ family: "O'Brien Sans", mono: false }]);
  });

  it('reads CRLF lines and an unknown spacing as proportional', () => {
    expect(parseFontList('A\t100\r\nB\tdual\r\n')).toEqual([
      { family: 'A', mono: true },
      { family: 'B', mono: false },
    ]);
  });

  it("asks fc-list for each face's first family name and its spacing, a line each", () => {
    expect(FC_LIST_FORMAT).toBe('%{family[0]}\\t%{spacing}\\n');
  });
});
