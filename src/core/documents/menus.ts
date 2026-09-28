import type { Clipboard, MenuItem, OsShell } from '../ports';
import type { TabRegistry } from '../tabs/registry';

export interface DocumentMenusDeps {
  tabs: TabRegistry;
  shell: OsShell;
  clipboard: Clipboard;
  /** Shows a native menu in the window; resolves with the chosen item id, or null. */
  showMenu: (window: number, items: readonly MenuItem[]) => Promise<string | null>;
}

/**
 * Menus main builds for a tab (ADR-004). The page only asks for one; main fills it from the path
 * it holds and acts on the choice itself, so the page never names a path or triggers an action.
 */
export class DocumentMenus {
  constructor(private readonly deps: DocumentMenusDeps) {}

  /** The status bar's path: copy it, or reveal the file in the file manager. */
  async path(id: string, window: number): Promise<void> {
    const tab = this.deps.tabs.get(id, window);
    if (!tab) throw new Error('unknown document');
    const choice = await this.deps.showMenu(window, [
      { id: 'copy-path', label: 'Copy path' },
      { id: 'reveal', label: 'Reveal in Files' },
    ]);
    if (choice === 'copy-path') this.deps.clipboard.writeText(tab.path);
    else if (choice === 'reveal') this.deps.shell.revealInFileManager(tab.path);
  }
}
