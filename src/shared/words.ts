/** Han, Hiragana and Katakana are written without spaces: each character counts as a word. */
const CJK = String.raw`\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}`;
const LETTER = String.raw`[[\p{L}\p{N}\p{M}]--[${CJK}]]`;
/**
 * A word: letters and digits, joined by an apostrophe or a hyphen (`isn't`, `state-of-the-art`),
 * or by a point or comma between digits (`2.0`, `1,000`).
 */
const WORD = new RegExp(String.raw`[${CJK}]|${LETTER}+(?:(?:['’\-]|(?<=\p{N})[.,](?=\p{N}))${LETTER}+)*`, 'gv');

/** How many words `text` holds, as a reader (or a word processor) would count them. */
export function countWords(text: string): number {
  let count = 0;
  WORD.lastIndex = 0;
  while (WORD.exec(text)) count++;
  return count;
}

/** Words read per minute, for the status bar's reading time. */
const WORDS_PER_MINUTE = 230;

/** About how long `words` take to read ("6 min", "< 1 min"), or null with nothing to read. */
export function readingTime(words: number): string | null {
  if (words === 0) return null;
  const minutes = Math.round(words / WORDS_PER_MINUTE);
  return minutes === 0 ? '< 1 min' : `${minutes} min`;
}
