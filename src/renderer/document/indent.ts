/** How many lines are read to tell a file's indent: enough for any file's habit, cheap on a huge one. */
const SAMPLE_LINES = 2000;

/**
 * The indent a file uses, so Tab in edit mode adds what is already there: a tab where tabs lead
 * more lines than spaces, four spaces where every space indent is a multiple of four, else two
 * (also for a file with no indented line yet).
 */
export function indentUnitOf(lines: Iterable<string>, limit = SAMPLE_LINES): string {
  let tabs = 0;
  let spaced = 0;
  let allFours = true;
  let read = 0;
  for (const line of lines) {
    if (read++ >= limit) break;
    if (!line.trim()) continue;
    if (line.startsWith('\t')) tabs++;
    else if (line.startsWith(' ')) {
      spaced++;
      if ((line.length - line.trimStart().length) % 4 !== 0) allFours = false;
    }
  }
  if (tabs > spaced) return '\t';
  return spaced > 0 && allFours ? '    ' : '  ';
}
