/**
 * The one span to replace in `old` to get `text`: everything before the first difference and after
 * the last stays, so a change on disk keeps the reader's place around it.
 */
export function diffSpan(old: string, text: string): { from: number; to: number; insert: string } {
  let start = 0;
  const shorter = Math.min(old.length, text.length);
  while (start < shorter && old.charCodeAt(start) === text.charCodeAt(start)) start++;
  let end = 0;
  while (end < shorter - start && old.charCodeAt(old.length - 1 - end) === text.charCodeAt(text.length - 1 - end)) end++;
  return { from: start, to: old.length - end, insert: text.slice(start, text.length - end) };
}
