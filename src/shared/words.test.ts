import { describe, expect, it } from 'vitest';
import { countWords, readingTime } from './words';

describe('countWords', () => {
  it('counts runs of letters or digits between spaces and punctuation', () => {
    expect(countWords('The quick brown fox.')).toBe(4);
    expect(countWords('  Hello,\tworld!\n\nAgain  ')).toBe(3);
    expect(countWords('Version 2.0 shipped in 2026, all 1,000 of them')).toBe(9);
  });

  it("keeps hyphenated words and contractions whole, as a reader counts them", () => {
    expect(countWords("state-of-the-art isn't hard")).toBe(3);
    expect(countWords('l’été d’Ana')).toBe(2);
  });

  it('counts accented and non-Latin alphabetic words', () => {
    expect(countWords('Educación y años')).toBe(3);
    expect(countWords('Привет мир')).toBe(2);
  });

  it('counts each CJK character as a word, as word processors do', () => {
    expect(countWords('日本語の文章')).toBe(6);
    expect(countWords('Hello 世界')).toBe(3);
  });

  it('ignores punctuation, symbols and emoji on their own', () => {
    expect(countWords('— · … → 🙂 ---')).toBe(0);
    expect(countWords('')).toBe(0);
  });
});

describe('readingTime', () => {
  it('reads at about 230 words a minute, rounded, never 0 minutes for some text', () => {
    expect(readingTime(0)).toBeNull();
    expect(readingTime(1)).toBe('< 1 min');
    expect(readingTime(229)).toBe('1 min');
    expect(readingTime(230)).toBe('1 min');
    expect(readingTime(1380)).toBe('6 min');
    expect(readingTime(13_800)).toBe('60 min');
  });
});
