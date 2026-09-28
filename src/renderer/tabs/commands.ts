import type { Command } from '../../shared/keymap';
import type { TabsView } from './store';

export type TabAction =
  | { kind: 'activate'; id: string }
  | { kind: 'move'; id: string; position: number }
  | { kind: 'close'; id: string }
  | { kind: 'reopen' };

/** What a tab shortcut does to this window's tabs (UX §5); null when it does nothing. */
export function tabAction(command: Command, tabNumber: number | null, view: TabsView): TabAction | null {
  if (command === 'reopenClosed') return { kind: 'reopen' };
  const { tabs, active } = view;
  const index = tabs.findIndex((tab) => tab.id === active);
  if (index < 0) return null;
  const activate = (at: number) => {
    const tab = tabs[at];
    return tab ? ({ kind: 'activate', id: tab.id } as const) : null;
  };
  switch (command) {
    case 'nextTab':
      return activate((index + 1) % tabs.length);
    case 'previousTab':
      return activate((index - 1 + tabs.length) % tabs.length);
    case 'goToTab':
      return tabNumber === null ? null : activate(tabNumber - 1);
    case 'goToLastTab':
      return activate(tabs.length - 1);
    case 'moveTabLeft':
      return index > 0 ? { kind: 'move', id: active!, position: index - 1 } : null;
    case 'moveTabRight':
      return index < tabs.length - 1 ? { kind: 'move', id: active!, position: index + 1 } : null;
    case 'closeTab':
      return { kind: 'close', id: active! };
    default:
      return null;
  }
}
