/** The lists main offers the page to pick a file from. */
type SelectionList = 'recent' | 'quick-open';

/**
 * Picks the page makes from lists main offered (ADR-004): main hands out opaque ids, and a pick
 * counts only if it names an entry of the last list main offered that window. The page never
 * names a path.
 */
export class SelectionGrants {
  private readonly offers = new Map<string, Map<string, string>>();

  constructor(private readonly randomId: () => string) {}

  /** Replaces the window's list; a path the last list had keeps its id (a list updating as results stream in). */
  offer(window: number, list: SelectionList, paths: readonly string[]): { id: string; path: string }[] {
    const previous = new Map([...(this.offers.get(`${window}:${list}`) ?? [])].map(([id, path]) => [path, id]));
    const entries = paths.map((path) => ({ id: previous.get(path) ?? this.randomId(), path }));
    this.offers.set(`${window}:${list}`, new Map(entries.map((entry) => [entry.id, entry.path])));
    return entries;
  }

  choose(window: number, list: SelectionList, id: string): string | null {
    return this.offers.get(`${window}:${list}`)?.get(id) ?? null;
  }

  /** Takes a list back from every window (its entries changed, as when recent files are cleared). */
  withdraw(list: SelectionList): void {
    for (const key of this.offers.keys()) if (key.endsWith(`:${list}`)) this.offers.delete(key);
  }

  closeWindow(window: number): void {
    for (const key of this.offers.keys()) if (key.startsWith(`${window}:`)) this.offers.delete(key);
  }
}
