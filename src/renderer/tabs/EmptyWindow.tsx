import { useEffect, useState } from 'react';
import type { PreviousSession } from '../../shared/contracts';
import type { Platform } from '../../shared/keymap';

function split(path: string): { name: string; folder: string } {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return { name: path.slice(at + 1), folder: path.slice(0, at) };
}

const WHEN = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * A window without tabs (UX §4): how to open files, the profile's recent files (opened by the id
 * main gave each, never by path), and the previous sessions to restore.
 */
export function EmptyWindow({ platform }: { platform: Platform }) {
  const [recent, setRecent] = useState<{ id: string; path: string }[]>([]);
  const [previous, setPrevious] = useState<PreviousSession[]>([]);

  useEffect(() => {
    let current = true;
    void window.galeo.recent.list().then((list) => current && setRecent(list));
    void window.galeo.session.previous().then((list) => current && setPrevious(list));
    return () => {
      current = false;
    };
  }, []);

  const clear = () => {
    setRecent([]);
    void window.galeo.recent.clear();
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
              const { name, folder } = split(path);
              return (
                <li key={id}>
                  <button type="button" className="empty-window-item" title={path} onClick={() => void window.galeo.recent.open(id)}>
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
                <button type="button" className="empty-window-item" onClick={() => void window.galeo.session.restorePrevious(session.snapshot)}>
                  <span>{WHEN.format(session.savedAt)}</span>
                  <span className="empty-window-folder">
                    {session.tabs} {session.tabs === 1 ? 'tab' : 'tabs'}
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
