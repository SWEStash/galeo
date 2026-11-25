/**
 * What a find opened with text selected starts from (#70): the selection on one line, as it is;
 * nothing from an empty or blank one, or one over several lines.
 */
export function findSeedOf(selected: string | null): string | null {
  if (!selected || selected.trim() === '' || /[\r\n]/.test(selected)) return null;
  return selected;
}

/** What each of the window's tabs has selected, as a find query (`findSeedOf`), by tab id: find in all tabs starts from the shown one's. */
export const selectedQueries = new Map<string, () => string | null>();
