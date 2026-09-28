/** The lists main offers the page to pick a file from. */
export type SelectionList = 'recent' | 'quick-open';

/**
 * Picks the page makes from lists main offered (ADR-004): main hands out opaque ids, and a pick
 * counts only if it names an entry of the last list main offered that window. The page never
 * names a path.
 */
export class SelectionGrants {
  private readonly offers = new Map<string, Map<string, string>>();

  constructor(private readonly randomId: () => string) {}

  offer(window: number, list: SelectionList, paths: readonly string[]): { id: string; path: string }[] {
    const entries = paths.map((path) => ({ id: this.randomId(), path }));
    this.offers.set(`${window}:${list}`, new Map(entries.map((entry) => [entry.id, entry.path])));
    return entries;
  }

  choose(window: number, list: SelectionList, id: string): string | null {
    return this.offers.get(`${window}:${list}`)?.get(id) ?? null;
  }

  closeWindow(window: number): void {
    for (const key of this.offers.keys()) if (key.startsWith(`${window}:`)) this.offers.delete(key);
  }
}
