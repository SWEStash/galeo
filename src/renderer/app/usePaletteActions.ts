import { useCallback } from 'react';
import { useDispatcher } from '../commands/useCommands';
import type { PaletteEntry } from '../palette/entries';
import { shownTab, type TabStore } from '../tabs/store';
import { reportFailure } from '../tabs/closed-tab';

/** What a palette entry does in this window, besides running a command. */
export function usePaletteActions(store: TabStore, say: (message: string) => void, recentCleared: () => void, openAbout: () => void) {
  const dispatcher = useDispatcher();
  return useCallback(
    (entry: PaletteEntry) => {
      const { action } = entry;
      if (action.kind === 'command') {
        if (!dispatcher.run(action.command, { typing: false, tabNumber: action.tabNumber ?? null })) say(`${entry.label} isn't available here`);
      } else if (action.kind === 'main') void window.galeo.window.command(action.command).catch(reportFailure(say, `${entry.label} didn't work`));
      else if (action.kind === 'hint') say(action.message);
      else if (action.kind === 'openWithDefaultApp') {
        const shown = shownTab(store.getSnapshot());
        if (shown && shown.kind !== 'settings') void window.galeo.documents.contextMenu(shown.id).catch(reportFailure(say, `${entry.label} didn't work`));
        else say('No document is shown');
      } else if (action.kind === 'restorePrevious') {
        const failed = reportFailure(say, "Couldn't restore the previous session");
        void window.galeo.session.previous().then(([latest]) => {
          if (latest) void window.galeo.session.restorePrevious(latest.snapshot).catch(failed);
          else say('No previous session to restore');
        }, failed);
      } else if (action.kind === 'about') openAbout();
      else {
        void window.galeo.recent.clear().then(() => {
          recentCleared();
          say('Recent files cleared');
        }, reportFailure(say, "Couldn't clear the recent files"));
      }
    },
    [dispatcher, store, say, recentCleared, openAbout],
  );
}
