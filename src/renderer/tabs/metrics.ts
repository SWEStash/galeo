import { readingTime } from '../../shared/words';

/**
 * The document's metrics for the status bar, "1,234 ln · 2,310 words · 10 min": each part only
 * when the document has that count ("1 word", and no time with nothing to read).
 */
export function metricsLabel(lines: number | null, words: number | null): string | null {
  const parts: string[] = [];
  if (lines != null) parts.push(`${lines.toLocaleString('en')} ln`);
  if (words != null) {
    parts.push(`${words.toLocaleString('en')} ${words === 1 ? 'word' : 'words'}`);
    const time = readingTime(words);
    if (time) parts.push(time);
  }
  return parts.length ? parts.join(' · ') : null;
}
