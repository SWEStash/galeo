import type { DocumentMenuChoice, DocumentMenuContext } from '../../shared/contracts/ipc';
import type { Command } from '../../shared/keymap';
import { unlessClosed } from '../tabs/closed-tab';

const COMMANDS: Record<DocumentMenuChoice, Command> = {
  back: 'back',
  forward: 'forward',
  find: 'find',
  reload: 'reload',
  save: 'save',
  'expand-all': 'expandAll',
  'collapse-all': 'collapseAll',
  'copy-json-path': 'copyJsonPath',
  'copy-rich': 'copyRichText',
};

/**
 * The document's right-click menu (UX F11): main builds and shows it, and acts on Edit and the file
 * entries itself; the page runs what comes back as that command, as its shortcut does.
 */
export function showDocumentMenu(id: string, context: DocumentMenuContext, run: (command: Command) => void, say: (message: string) => void): Promise<void> {
  return window.galeo.documents.contextMenu(id, context).then((choice) => {
    if (choice) run(COMMANDS[choice]);
  }, unlessClosed(say, "The menu couldn't open"));
}
