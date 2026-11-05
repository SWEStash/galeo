/** A task item's line: its list marker, then its box (`[ ]`, `[x]` or `[X]`); the box's mark is group 2. */
const TASK_BOX = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])\]/;

/** The line with its task box flipped (`[ ]` ↔ `[x]`), or null when it starts with no task item (ADR-031). */
export function flipTaskBox(line: string): string | null {
  const box = TASK_BOX.exec(line);
  if (!box) return null;
  const at = box[1]!.length;
  return `${line.slice(0, at)}${box[2] === ' ' ? 'x' : ' '}${line.slice(at + 1)}`;
}
