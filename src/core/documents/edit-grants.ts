/** A dirty tab's text and the version it was loaded from (null: the file was gone), held for a page that crashes. */
export interface KeptText {
  text: string;
  base: string | null;
}

interface Grant {
  window: number;
  path: string;
  dirty: boolean;
  kept: KeptText | null;
}

/**
 * The tabs the reader put in edit mode (ADR-013): only main grants one, from a key or menu item it
 * saw itself (ADR-004), and a save is allowed only for a granted tab's own file. A grant ends when
 * the page leaves edit mode, or the tab closes or shows another file; none is ever saved. A
 * granted tab also carries whether the page has unsaved changes in it, for close and quit, and
 * their text: in memory only, never on disk (SR-16), so a renderer crash doesn't lose it.
 */
export class EditGrants {
  private readonly grants = new Map<string, Grant>();

  grant(id: string, window: number, path: string): void {
    this.grants.set(id, { window, path, dirty: false, kept: null });
  }

  allows(id: string, window: number, path: string): boolean {
    const grant = this.grants.get(id);
    return grant?.window === window && grant.path === path;
  }

  /** The page left edit mode: a window can only give up its own tab's grant. */
  revoke(id: string, window: number): void {
    if (this.grants.get(id)?.window === window) this.grants.delete(id);
  }

  /** The page's word on unsaved changes, for its own granted tabs only. */
  setDirty(id: string, window: number, dirty: boolean): void {
    const grant = this.grants.get(id);
    if (grant?.window !== window) return;
    grant.dirty = dirty;
    if (!dirty) grant.kept = null;
  }

  /** The page's latest unsaved text for its own granted tab. */
  keep(id: string, window: number, text: string, base: string | null): void {
    const grant = this.grants.get(id);
    if (grant?.window !== window) return;
    grant.dirty = true;
    grant.kept = { text, base };
  }

  /** Whether the window's tab is in edit mode. */
  granted(id: string, window: number): boolean {
    return this.grants.get(id)?.window === window;
  }

  /** The tab moved to another window (ADR-019): its grant, unsaved mark and kept text go with it. */
  transfer(id: string, from: number, to: number): void {
    const grant = this.grants.get(id);
    if (grant?.window === from) grant.window = to;
  }

  kept(id: string, window: number): KeptText | null {
    const grant = this.grants.get(id);
    return grant?.window === window ? grant.kept : null;
  }

  /** A crashed page comes back read-only: only tabs with unsaved text stay in edit mode. */
  dropClean(window: number): void {
    for (const [id, grant] of this.grants) if (grant.window === window && !grant.kept) this.grants.delete(id);
  }

  /** The window's tabs with unsaved changes. */
  dirty(window: number): string[] {
    return [...this.grants].filter(([, grant]) => grant.window === window && grant.dirty).map(([id]) => id);
  }

  /** Keeps the grants of the window's tabs that still show the same file; returns the dropped tabs. */
  sync(window: number, tabs: readonly { id: string; path: string }[]): string[] {
    const showing = new Map(tabs.map((tab) => [tab.id, tab.path]));
    const dropped: string[] = [];
    for (const [id, grant] of this.grants) {
      if (grant.window !== window || showing.get(id) === grant.path) continue;
      this.grants.delete(id);
      dropped.push(id);
    }
    return dropped;
  }

  closeWindow(window: number): void {
    for (const [id, grant] of this.grants) if (grant.window === window) this.grants.delete(id);
  }
}
