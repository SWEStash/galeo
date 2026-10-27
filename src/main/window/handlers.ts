import type { CrashRecovery } from '../../core/tabs/crashes';
import type { WindowCommand } from '../../shared/keymap';
import type { Handlers } from '../ipc/register';

type WindowChannels = 'window.command' | 'window.retryAfterCrashes';

/** Commands the page asks main to run on its window, as if their key was pressed there. */
export function windowHandlers<W>(deps: {
  /** The sender's window, with what running a command needs; undefined for a window with no profile. */
  windowOf: (window: number) => W | undefined;
  command: (command: WindowCommand, window: W) => void;
  crashes: Pick<CrashRecovery, 'retry'>;
  /** Loads the window's page again, its tabs restored. */
  reload: (window: W) => void;
}): Pick<Handlers, WindowChannels> {
  const { windowOf, command, crashes, reload } = deps;
  return {
    'window.command': ([name], event) => {
      const window = windowOf(event.sender.id);
      if (window) command(name, window);
    },
    'window.retryAfterCrashes': (_args, event) => {
      const window = windowOf(event.sender.id);
      if (!window || !crashes.retry(event.sender.id)) throw new Error('not showing the crash loop');
      reload(window);
    },
  };
}
