import type { PreviousSession } from '../../shared/contracts';
import type { Platform } from '../../shared/keymap';
import { fileName } from '../../shared/paths';
import { plural } from '../../shared/words';
import { useLoaded } from '../useLoaded';
import { reportFailure } from './closed-tab';

const WHEN = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * A window without tabs (UX §4): how to open files, the profile's recent files (opened by the id
 * main gave each, never by path), and the previous sessions to restore.
 */
export function EmptyWindow({ platform, say }: { platform: Platform; say: (message: string) => void }) {
  const [recent, setRecent] = useLoaded<{ id: string; path: string }[]>(() => window.galeo.recent.list(), [], () => []);
  const [previous] = useLoaded<PreviousSession[]>(() => window.galeo.session.previous(), [], () => []);

  const clear = () => {
    setRecent([]);
    void window.galeo.recent.clear().catch(reportFailure(say, "Couldn't clear the recent files"));
  };

  return (
    <section className="empty-window" data-testid="empty-window" aria-labelledby="empty-window-title">
      <h1 id="empty-window-title">No documents open</h1>
      <p className="empty-window-hint">Drop files here · {platform === 'darwin' ? '⌘P' : 'Ctrl+P'} to open</p>
      {recent.length > 0 && (
        <>
          <h2>Recent</h2>
          <ul className="empty-window-list">
            {recent.map(({ id, path }) => {
              const name = fileName(path);
              const folder = path.slice(0, path.length - name.length - 1);
              return (
                <li key={id}>
                  <button type="button" className="empty-window-item" title={path} onClick={() => void window.galeo.recent.open(id).catch(reportFailure(say, `Couldn't open ${name}`))}>
                    <span>{name}</span>
                    <span className="empty-window-folder">{folder}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={clear}>
            Clear recent
          </button>
        </>
      )}
      {previous.length > 0 && (
        <>
          <h2>Restore previous session</h2>
          <ul className="empty-window-list">
            {previous.map((session) => (
              <li key={session.snapshot}>
                <button type="button" className="empty-window-item" onClick={() => void window.galeo.session.restorePrevious(session.snapshot).catch(reportFailure(say, "Couldn't restore the previous session"))}>
                  <span>{WHEN.format(session.savedAt)}</span>
                  <span className="empty-window-folder">
                    {plural(session.tabs, 'tab', 'tabs')}
                    {session.windows > 1 ? ` in ${session.windows} windows` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
