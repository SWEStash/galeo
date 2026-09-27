import { describe, expect, it } from 'vitest';
import { textParagraphs } from './text-reader';

describe('textParagraphs', () => {
  it('splits at blank lines, keeping line breaks inside a paragraph and each first line', () => {
    expect(textParagraphs('one\ntwo\n\nthree\n')).toEqual([
      { line: 1, text: 'one\ntwo' },
      { line: 4, text: 'three' },
    ]);
  });

  it('treats runs of blank or whitespace-only lines as one break, and skips leading ones', () => {
    expect(textParagraphs('\n\n  \nfirst\n \t\n\nsecond')).toEqual([
      { line: 4, text: 'first' },
      { line: 7, text: 'second' },
    ]);
  });

  it('handles Windows line endings', () => {
    expect(textParagraphs('a\r\nb\r\n\r\nc')).toEqual([
      { line: 1, text: 'a\nb' },
      { line: 4, text: 'c' },
    ]);
  });

  it('keeps indentation and has no paragraphs for an all-blank text', () => {
    expect(textParagraphs('    indented\n  more')).toEqual([{ line: 1, text: '    indented\n  more' }]);
    expect(textParagraphs('\n \n')).toEqual([]);
  });
});
