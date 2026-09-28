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

  constructor(private readonly limits: WarmLimits) {}

  activated(window: number, id: string, weight: number): string[] {
    const tabs = (this.windows.get(window) ?? []).filter((tab) => tab.id !== id);
    tabs.unshift({ id, weight });
    this.windows.set(window, tabs);
    return this.fit(tabs);
  }

  rendered(window: number, id: string, weight: number): string[] {
    const tabs = this.windows.get(window) ?? [];
    const tab = tabs.find((each) => each.id === id);
    if (!tab) return [];
    tab.weight = weight;
    return this.fit(tabs);
  }

  /** Memory is short: the least recently shown warm tab goes, even under the limits. */
  pressure(window: number): string[] {
    const tabs = this.windows.get(window) ?? [];
    return tabs.length > 1 ? [tabs.pop()!.id] : [];
  }

  forget(window: number, id: string): void {
    const tabs = this.windows.get(window);
    if (tabs) this.windows.set(window, tabs.filter((tab) => tab.id !== id));
  }

  closeWindow(window: number): void {
    this.windows.delete(window);
  }

  /** The window's rendered tabs, active first. */
  warm(window: number): string[] {
    return (this.windows.get(window) ?? []).map((tab) => tab.id);
  }

  private fit(tabs: Rendered[]): string[] {
    const demoted: string[] = [];
    const warmBytes = () => tabs.slice(1).reduce((sum, tab) => sum + tab.weight, 0);
    while (tabs.length > 1 && (tabs.length - 1 > this.limits.count || warmBytes() > this.limits.bytes)) {
      demoted.push(tabs.pop()!.id);
    }
    return demoted;
  }
}
