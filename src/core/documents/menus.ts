import { DOCUMENT_MENU_CHOICES, TAB_MENU_CHOICES, type DocumentMenuChoice, type DocumentMenuContext, type TabMenuChoice } from '../../shared/contracts/ipc';
import { UNKNOWN_DOCUMENT } from '../../shared/documents';
import { canOpenWithDefaultApp } from '../links/open-with';
import type { Clipboard, FileSystem, MenuItem, OsShell } from '../ports';
import type { TabRegistry } from '../tabs/registry';

interface DocumentMenusDeps {
  tabs: TabRegistry;
  fs: FileSystem;
  shell: OsShell;
  clipboard: Clipboard;
  /** Shows a native menu in the window; resolves with the chosen item id, or null. */
  showMenu: (window: number, items: readonly MenuItem[]) => Promise<string | null>;
  /** `process.platform`: which rule decides what goes to the default app (ADR-028). */
  platform: string;
  /** Whether the tab is in edit mode (main's grant, ADR-013). */
  editing: (id: string, window: number) => boolean;
  /** Main's own Ctrl+E on the window's shown tab (ADR-013, ADR-015). */
  edit: (window: number) => void;
  /** The tab the window shows now. */
  shown: (window: number) => string | null;
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
   * The document's own menu (UX F11): Back and Forward with history, Find…, Reload, Edit (main's own
   * capability, on the shown tab) or Save while editing, a JSON tree's entries, then open it with the
   * default app (only for plain, non-executable files, SR-05), reveal it, or copy its path. Main acts
   * on Edit and the file entries itself, checking the file again when the choice comes back; the
   * other choices go back to the page, which runs their commands.
   */
  async document(id: string, window: number, { tree }: DocumentMenuContext): Promise<DocumentMenuChoice | null> {
    const tab = this.deps.tabs.get(id, window);
    if (!tab) throw new Error(UNKNOWN_DOCUMENT);
    const history = this.deps.tabs.history(id, window);
    const editing = this.deps.editing(id, window);
    const choice = await this.deps.showMenu(window, [
      { id: 'back', label: 'Back', enabled: history.back },
      { id: 'forward', label: 'Forward', enabled: history.forward },
      { id: 'find', label: 'Find…' },
      { id: 'reload', label: 'Reload' },
      editing ? { id: 'save', label: 'Save' } : { id: 'edit', label: 'Edit' },
      ...(tree
        ? [
            { id: 'expand-all', label: 'Expand all' },
            { id: 'collapse-all', label: 'Collapse all' },
            { id: 'copy-json-path', label: 'Copy JSON path' },
          ]
        : []),
      { id: 'open-default', label: 'Open with default app', enabled: await this.openable(tab.path) },
      { id: 'reveal', label: 'Reveal in Files' },
      { id: 'copy-path', label: 'Copy path' },
    ]);
    // The tab may have closed, or the file changed, while the menu was open.
    if (this.deps.tabs.get(id, window)?.path !== tab.path) return null;
    if (choice === 'open-default') {
      if (await this.openable(tab.path)) await this.deps.shell.openPath(tab.path);
      return null;
    }
    if (choice === 'edit') {
      if (this.deps.shown(window) === id) this.deps.edit(window);
      return null;
    }
    if (choice === 'copy-path' || choice === 'reveal') {
      this.act(choice, tab.path);
      return null;
    }
    return DOCUMENT_MENU_CHOICES.find((each) => each === choice) ?? null;
  }

  /**
   * A tab's right-click menu (UX F4): main copies the path and reveals the file itself; the other
   * choices go back to the page, which runs the same command as their shortcuts on this tab.
   */
  async tab(id: string, window: number, { canReopen }: { canReopen: boolean }): Promise<TabMenuChoice | null> {
    const tab = this.deps.tabs.get(id, window);
    if (!tab) throw new Error(UNKNOWN_DOCUMENT);
    const file = tab.kind !== 'settings';
    const movable = file && this.deps.tabs.list(window).length > 1;
    const choice = await this.deps.showMenu(window, [
      { id: 'close', label: 'Close tab' },
      { id: 'reopen', label: 'Reopen closed tab', enabled: canReopen },
      { id: 'move-new', label: 'Move to new window', enabled: movable },
      { id: 'move-to', label: 'Move to window…', enabled: movable },
      { id: 'copy-path', label: 'Copy path', enabled: file },
      { id: 'reveal', label: 'Reveal in Files', enabled: file },
      { id: 'pin', label: this.deps.tabs.pinned(id, window) ? 'Unpin tab' : 'Pin tab', enabled: file },
    ]);
    // The tab may have closed while the menu was open.
    const now = this.deps.tabs.get(id, window);
    if (!now) return null;
    if (choice === 'copy-path' || choice === 'reveal') {
      this.act(choice, now.path);
      return null;
    }
    return TAB_MENU_CHOICES.find((each) => each === choice) ?? null;
  }

  private act(choice: string | null, path: string): void {
    if (choice === 'copy-path') this.deps.clipboard.writeText(path);
    else if (choice === 'reveal') this.deps.shell.revealInFileManager(path);
  }

  private async openable(path: string): Promise<boolean> {
    try {
      const stat = await this.deps.fs.stat(path);
      return canOpenWithDefaultApp({ path, target: await this.deps.fs.realpath(path), kind: stat.kind, executable: stat.executable }, this.deps.platform);
    } catch {
      return false;
    }
  }
}
