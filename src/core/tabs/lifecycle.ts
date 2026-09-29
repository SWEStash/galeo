export interface WarmLimits {
  /** Tabs kept rendered besides the active one. */
  count: number;
  /** Rendered weight the warm tabs may hold together. */
  bytes: number;
}

interface Rendered {
  id: string;
  weight: number;
}

/**
 * Which tabs of each window keep their rendered DOM (ADR-002). The active tab always does; up to
 * `count` others stay warm while they fit in `bytes`, and the least recently shown go first. The
 * returned ids are the tabs the window must hibernate. Weight is what the window reports for a
 * tab's rendered content.
 */
export class WarmTabs {
  /** Per window, most recently shown first; the first one is the active tab. */
  private readonly windows = new Map<number, Rendered[]>();
  /** Windows whose profile set its own limits; the others use the default ones. */
  private readonly own = new Map<number, WarmLimits>();

  constructor(private limits: WarmLimits) {}

  /** The window shows `id`; without a weight, it keeps the one it last reported (or 0, not rendered yet). */
  activated(window: number, id: string, weight?: number): string[] {
    const previous = this.windows.get(window) ?? [];
    const known = previous.find((tab) => tab.id === id)?.weight ?? 0;
    const tabs = previous.filter((tab) => tab.id !== id);
    tabs.unshift({ id, weight: weight ?? known });
    this.windows.set(window, tabs);
    return this.fit(window, tabs);
  }

  rendered(window: number, id: string, weight: number): string[] {
    const tabs = this.windows.get(window) ?? [];
    const tab = tabs.find((each) => each.id === id);
    if (!tab) return [];
    tab.weight = weight;
    return this.fit(window, tabs);
  }

  /** Memory is short: the least recently shown warm tab goes, even under the limits. */
  pressure(window: number): string[] {
    const tabs = this.windows.get(window) ?? [];
    return tabs.length > 1 ? [tabs.pop()!.id] : [];
  }

  /**
   * New limits (a settings change), for `windows` only or as the default for the rest; returns,
   * per window, the tabs to hibernate now.
   */
  setLimits(limits: WarmLimits, windows?: readonly number[]): Map<number, string[]> {
    if (windows) for (const window of windows) this.own.set(window, limits);
    else this.limits = limits;
    const demoted = new Map<number, string[]>();
    for (const [window, tabs] of this.windows) {
      if (windows && !windows.includes(window)) continue;
      const ids = this.fit(window, tabs);
      if (ids.length > 0) demoted.set(window, ids);
    }
    return demoted;
  }

  forget(window: number, id: string): void {
    const tabs = this.windows.get(window);
    if (tabs) this.windows.set(window, tabs.filter((tab) => tab.id !== id));
  }

  closeWindow(window: number): void {
    this.windows.delete(window);
    this.own.delete(window);
  }

  /** The window's rendered tabs, active first. */
  warm(window: number): string[] {
    return (this.windows.get(window) ?? []).map((tab) => tab.id);
  }

  private fit(window: number, tabs: Rendered[]): string[] {
    const { count, bytes } = this.own.get(window) ?? this.limits;
    const demoted: string[] = [];
    const warmBytes = () => tabs.slice(1).reduce((sum, tab) => sum + tab.weight, 0);
    while (tabs.length > 1 && (tabs.length - 1 > count || warmBytes() > bytes)) {
      demoted.push(tabs.pop()!.id);
    }
    return demoted;
  }
}
