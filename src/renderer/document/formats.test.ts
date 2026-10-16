import { describe, expect, it } from 'vitest';
import { FORMAT_VIEWS, type FormatId } from '../../shared/formats';
import { FORMAT_NAMES, sourceLanguage } from './formats';

const ids = Object.keys(FORMAT_VIEWS) as FormatId[];

describe('the page side of the format registry', () => {
  it('names every format for messages', () => {
    expect(ids.filter((id) => !FORMAT_NAMES[id])).toEqual([]);
    expect(FORMAT_NAMES.json).toBe('JSON');
  });

  it('highlights each format with its language, and text, tables and unknown files as plain source', () => {
    const cases: [FormatId, string, string | null][] = [
      ['markdown', '/d/a.md', 'markdown'],
      ['mdx', '/d/a.mdx', 'markdown'],
      ['log', '/d/a.log', 'log'],
      ['json', '/d/a.json', 'JSON'],
      ['jsonl', '/d/a.jsonl', 'JSON'],
      ['yaml', '/d/a.yml', 'YAML'],
      ['toml', '/d/Cargo.toml', 'TOML'],
      ['text', '/d/a.txt', null],
      ['csv', '/d/a.csv', null],
      ['tsv', '/d/a.tsv', null],
      ['plain', '/d/a.xyz', null],
    ];
    expect(cases.map(([format, path]) => sourceLanguage(format, path))).toEqual(cases.map(([, , language]) => language));
  });

  it("takes source code's language from the file name, whatever its case", () => {
    const cases: [string, string | null][] = [
      ['/d/main.ts', 'TypeScript'],
      ['/d/App.TSX', 'TSX'],
      ['/d/run.PY', 'Python'],
      ['/d/.zshrc.zsh', 'Shell'],
      ['/d/Dockerfile', 'Dockerfile'],
      ['/d/containerfile', 'Dockerfile'],
      ['/d/config.fish', null],
      ['/d/Makefile', null],
      ['/d/constructor', null],
      ['/d/x.__proto__', null],
    ];
    expect(cases.map(([path]) => sourceLanguage('code', path))).toEqual(cases.map(([, language]) => language));
  });
});
