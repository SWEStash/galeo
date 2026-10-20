import { UNKNOWN_DOCUMENT } from '../../shared/documents';
import { canOpenWithDefaultApp } from '../links/open-with';
import type { Clipboard, FileSystem, MenuItem, OsShell } from '../ports';
import type { TabRegistry } from '../tabs/registry';

export interface DocumentMenusDeps {
  tabs: TabRegistry;
  fs: FileSystem;
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
    if (!tab) throw new Error(UNKNOWN_DOCUMENT);
    const choice = await this.deps.showMenu(window, [
      { id: 'copy-path', label: 'Copy path' },
      { id: 'reveal', label: 'Reveal in Files' },
    ]);
    this.act(choice, tab.path);
  }

  /**
   * The document's own menu: open it with the default app (only for plain, non-executable files,
   * SR-05), reveal it, or copy its path. The file is checked again when the choice comes back.
   */
  async document(id: string, window: number): Promise<void> {
    const tab = this.deps.tabs.get(id, window);
    if (!tab) throw new Error(UNKNOWN_DOCUMENT);
    const choice = await this.deps.showMenu(window, [
      { id: 'open-default', label: 'Open with default app', enabled: await this.openable(tab.path) },
      { id: 'reveal', label: 'Reveal in Files' },
      { id: 'copy-path', label: 'Copy path' },
    ]);
    if (choice === 'open-default') {
      if (await this.openable(tab.path)) await this.deps.shell.openPath(tab.path);
      return;
    }
    this.act(choice, tab.path);
  }

  private act(choice: string | null, path: string): void {
    if (choice === 'copy-path') this.deps.clipboard.writeText(path);
    else if (choice === 'reveal') this.deps.shell.revealInFileManager(path);
  }

  private async openable(path: string): Promise<boolean> {
    try {
      const stat = await this.deps.fs.stat(path);
      return canOpenWithDefaultApp({ path, target: await this.deps.fs.realpath(path), kind: stat.kind, executable: stat.executable });
    } catch {
      return false;
    }
  }
}
