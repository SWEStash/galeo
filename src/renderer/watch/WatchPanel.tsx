import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { ListBox, ListBoxItem, type Key } from 'react-aria-components';
import type { Platform } from '../../shared/keymap';
import type { WatchEntry, WatchState } from '../../shared/watch';
import { reportFailure } from '../tabs/closed-tab';
import { Icon } from '../ui/icons';

/** At most one announcement of arrivals a second (UX F21). */
const ANNOUNCE_MS = 1000;

export const WATCH_PANEL_ID = 'watch-panel';

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const kindText = (entry: WatchEntry) => (entry.opened ? `${entry.kind}, opened` : entry.kind);

interface WatchPanelProps {
  state: WatchState;
  platform: Platform;
  onClose: () => void;
  say: (message: string) => void;
  /** Take the focus (the reader opened the panel). */
  autoFocus?: boolean;
}

/**
 * The window's watched folder (UX F21, ADR-034): the files created or changed there since watching
 * started, newest first. An entry opens by the id main gave it; Ctrl+Enter or a middle click opens
 * it in a new window. Esc closes the panel.
 */
export function WatchPanel({ state, platform, onClose, say, autoFocus = false }: WatchPanelProps) {
  const panel = useRef<HTMLElement>(null);
  const newWindow = useRef(false);
  const announcement = useArrivals(state.entries);
  const unopened = state.entries.some((entry) => !entry.opened);

  const listed = state.entries.length > 0;
  useEffect(() => {
    // With entries, the list takes the focus itself (its options render a moment later).
    if (autoFocus && !listed) panel.current?.querySelector<HTMLElement>('button')?.focus();
    // Only when asked: an update must never take the focus.
  }, [autoFocus, listed]);

  const open = (id: Key, inNewWindow: boolean) => {
    void window.galeo.watch.open(String(id), inNewWindow).catch(reportFailure(say, "That file couldn't open"));
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };
  const onKeyDownCapture = (event: KeyboardEvent) => {
    // Read by the action Enter makes a moment later.
    if (event.key === 'Enter') newWindow.current = platform === 'darwin' ? event.metaKey : event.ctrlKey;
  };
  const onAuxClick = (event: MouseEvent) => {
    if (event.button !== 1) return;
    const key = (event.target as Element).closest('[data-key]')?.getAttribute('data-key');
    if (key) open(key, true);
  };

  return (
    <aside ref={panel} id={WATCH_PANEL_ID} className="watch-panel" aria-label="Watched folder" data-testid="watch-panel" onKeyDown={onKeyDown}>
      <header className="watch-header">
        <h2 className="watch-title">Watching</h2>
        <span className="watch-folder" data-testid="watch-folder" title={state.shown}>
          {/* Isolated, so the right-to-left overflow keeps the path's characters in order. */}
          <bdi>{state.shown}</bdi>
        </span>
        {state.polling && <span className="watch-note">checked every few seconds</span>}
        <button type="button" className="watch-close" aria-label="Close watched folder (Ctrl+Shift+D)" title="Close (Ctrl+Shift+D)" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      {state.status === 'missing' && <p className="watch-state" data-testid="watch-state">The folder is gone.</p>}
      {state.status === 'denied' && <p className="watch-state" data-testid="watch-state">galeo can&apos;t read this folder.</p>}
      {state.entries.length === 0 && (state.status === 'watching' || state.status === 'starting') ? (
        <p className="watch-empty" data-testid="watch-empty">
          Nothing new yet. Files created or changed in this folder show up here as they arrive.
        </p>
      ) : (
        <div className="watch-list-area" onKeyDownCapture={onKeyDownCapture} onMouseDown={(event) => event.button === 1 && event.preventDefault()} onAuxClick={onAuxClick}>
          <ListBox
            className="watch-list"
            aria-label="Files in the watched folder"
            data-testid="watch-list"
            items={state.entries}
            selectionMode="none"
            {...(autoFocus ? { autoFocus: 'first' as const } : {})}
            onAction={(id) => {
              open(id, newWindow.current);
              newWindow.current = false;
            }}
          >
            {(entry) => (
              <ListBoxItem
                id={entry.id}
                textValue={entry.name}
                aria-label={`${entry.name}, ${kindText(entry)}, ${time(entry.at)}, in ${entry.folder || 'the folder itself'}`}
                className="watch-entry"
                data-testid="watch-entry"
                data-kind={entry.kind}
                data-opened={entry.opened || undefined}
              >
                <span className="watch-mark" aria-hidden="true" />
                <span className="watch-name">{entry.name}</span>
                <span className="watch-meta">
                  {kindText(entry)} · {time(entry.at)} · {entry.folder ? `${entry.folder}/` : './'}
                </span>
              </ListBoxItem>
            )}
          </ListBox>
        </div>
      )}
      <footer className="watch-footer">
        {state.truncated && <p className="watch-truncated">Showing the newest 200</p>}
        <button
          type="button"
          className="watch-action"
          data-testid="watch-open-all"
          disabled={!unopened}
          onClick={() => void window.galeo.watch.openAllNew().catch(reportFailure(say, "The new files couldn't open"))}
        >
          Open all new
        </button>
        <button type="button" className="watch-action" data-testid="watch-stop" onClick={() => void window.galeo.watch.stop().catch(reportFailure(say, "Watching didn't stop"))}>
          Stop watching
        </button>
      </footer>
      <span className="visually-hidden" role="status" data-testid="watch-announcement">
        {announcement}
      </span>
    </aside>
  );
}

/** What to announce of entries that arrived or changed since the last render, at most once a second. */
function useArrivals(entries: readonly WatchEntry[]): string {
  const seen = useRef<Set<string> | null>(null);
  const lastAt = useRef(-Infinity);
  const [said, setSaid] = useState('');
  const [due, setDue] = useState<string | null>(null);

  useEffect(() => {
    const keys = entries.map((entry) => `${entry.id}:${entry.at}`);
    // What the panel shows when it opens is no news.
    if (seen.current === null) {
      seen.current = new Set(keys);
      return;
    }
    const arrived = entries.filter((entry, index) => !entry.opened && !seen.current!.has(keys[index]!));
    for (const key of keys) seen.current.add(key);
    if (arrived.length === 0) return;
    const first = arrived[0]!;
    setDue(arrived.length === 1 ? `${first.name}, ${first.kind}` : `${arrived.length} files arrived, the newest ${first.name}`);
  }, [entries]);

  useEffect(() => {
    if (due === null) return;
    const wait = Math.max(0, lastAt.current + ANNOUNCE_MS - Date.now());
    const timer = setTimeout(() => {
      lastAt.current = Date.now();
      setSaid(due);
      setDue(null);
    }, wait);
    return () => clearTimeout(timer);
  }, [due]);

  return said;
}
