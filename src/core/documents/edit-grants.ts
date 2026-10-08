interface Grant {
  window: number;
  path: string;
}

/**
 * The tabs the reader put in edit mode (ADR-013): only main grants one, from a key or menu item it
 * saw itself (ADR-004), and a save is allowed only for a granted tab's own file. A grant ends when
 * the reader leaves edit mode, or the tab closes or shows another file; none is ever saved.
 */
export class EditGrants {
  private readonly grants = new Map<string, Grant>();

  /** Grants edit mode, or takes it back if granted; true when the tab is now editable. */
  toggle(id: string, window: number, path: string): boolean {
    if (this.allows(id, window, path)) {
      this.grants.delete(id);
      return false;
    }
    this.grants.set(id, { window, path });
    return true;
  }

  allows(id: string, window: number, path: string): boolean {
    const grant = this.grants.get(id);
    return grant?.window === window && grant.path === path;
  }

  /** The page left edit mode: a window can only give up its own tab's grant. */
  revoke(id: string, window: number): void {
    if (this.grants.get(id)?.window === window) this.grants.delete(id);
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
