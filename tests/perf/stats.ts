export interface Summary {
  n: number;
  median: number;
  p95: number;
  min: number;
  max: number;
}

export function summarize(samples: readonly number[]): Summary {
  if (samples.length === 0) throw new Error('no samples');
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const median = sorted.length % 2 ? sorted[Math.floor(mid)]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1]!;
  return { n: sorted.length, median, p95, min: sorted[0]!, max: sorted.at(-1)! };
}

/** The median must stay within the budget; `factor` loosens it on noisy shared CI runners. */
export function checkBudget(summary: Summary, budgetMs: number, factor: number): { ok: boolean; limit: number } {
  const limit = budgetMs * factor;
  return { ok: summary.median <= limit, limit };
}
