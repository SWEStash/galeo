import { describe, expect, it } from 'vitest';
import { indentUnitOf } from './indent';

const lines = (text: string) => text.split('\n');

describe('indentUnitOf', () => {
  it('indents with a tab where the file does', () => {
    expect(indentUnitOf(lines('- a\n\t- b\n\t\t- c'))).toBe('\t');
  });

  it('indents with four spaces where every indent is a multiple of four', () => {
    expect(indentUnitOf(lines('def f():\n    if x:\n        return 1'))).toBe('    ');
  });

  it('indents with two spaces where the indents are two apart', () => {
    expect(indentUnitOf(lines('- a\n  - b\n    - c'))).toBe('  ');
  });

  it("takes two spaces for a numbered list's three-space continuation", () => {
    expect(indentUnitOf(lines('1. a\n   more of a\n2. b'))).toBe('  ');
  });

  it('takes two spaces in a file with no indented line', () => {
    expect(indentUnitOf(lines('# Title\n\nText.'))).toBe('  ');
    expect(indentUnitOf([])).toBe('  ');
  });

  it('goes with the more common of tabs and spaces, ignoring blank lines', () => {
    expect(indentUnitOf(lines('\ta\n\tb\n    c\n   \n\t'))).toBe('\t');
    expect(indentUnitOf(lines('\ta\n    b\n    c'))).toBe('    ');
  });

  it('reads no more than the lines it is given up to its limit', () => {
    const many = [...Array.from({ length: 10 }, () => '  two'), ...Array.from({ length: 100 }, () => '\ttab')];
    expect(indentUnitOf(many, 10)).toBe('  ');
  });
});
