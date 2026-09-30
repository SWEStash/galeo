import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  Autocomplete,
  Collection,
  Dialog,
  Header,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Modal,
  ModalOverlay,
  TextField,
  type Key,
} from 'react-aria-components';
import type { Platform } from '../../shared/keymap';
import type { QuickOpenEntry, QuickOpenResults } from '../../shared/quick-open';
import { ignoreClosedTab } from '../tabs/closed-tab';

/**
 * Quick open (UX F8): a field over main's results, open tabs and recent files first, then the
 * repository of the shown file as its search streams in. Enter opens (the tab if it's open),
 * Ctrl+Enter opens in a new window, Esc closes. The page opens only by the ids main gave it.
 */
export function QuickOpen({ platform, onClose }: { platform: Platform; onClose: () => void }) {
  const [start, setStart] = useState<{ token: string; scope: string | null } | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<QuickOpenResults | null>(null);
  const latest = useRef({ token: '', query: '' });
  const newWindow = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  // The field takes the focus (after the dialog's own focus handling, which runs first).
  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    let current = true;
    let token = '';
    void window.galeo.quickOpen.start().then((started) => {
      token = started.token;
      if (!current) return void window.galeo.quickOpen.close(token);
      latest.current = { token, query: '' };
      setStart(started);
    });
    const stop = window.galeo.quickOpen.onResults((next) => {
      if (next.token === latest.current.token && next.query === latest.current.query) setResults(next);
    });
    return () => {
      current = false;
      stop();
      if (token) void window.galeo.quickOpen.close(token);
    };
  }, []);

  useEffect(() => {
    if (!start) return;
    latest.current = { token: start.token, query };
    let current = true;
    void window.galeo.quickOpen.query(start.token, query).then((next) => {
      if (current && next.query === latest.current.query) setResults(next);
    });
    return () => {
      current = false;
    };
  }, [start, query]);

  const entries = new Map((results?.sections ?? []).flatMap((section) => section.entries.map((entry) => [entry.id, entry] as const)));
  const choose = (key: Key) => {
    const entry = entries.get(String(key));
    if (!entry || !start) return;
    if (entry.folder) return setQuery(entry.path!);
    void window.galeo.quickOpen.open(start.token, entry.id, newWindow.current).catch(ignoreClosedTab);
    onClose();
  };
  // A stable list: the collection rebuilds whenever its items change identity.
  const sections = useMemo(() => (results?.sections ?? []).filter((section) => section.entries.length > 0), [results]);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    // Read by the choice Enter makes a moment later: Ctrl+Enter (⌘ on macOS) opens a new window.
    newWindow.current = platform === 'darwin' ? event.metaKey : event.ctrlKey;
    // Nothing chosen yet (the field changed without typing, as after going into a folder): the first one.
    const first = sections[0]?.entries[0];
    if (first && !input.current?.getAttribute('aria-activedescendant')) {
      event.preventDefault();
      event.stopPropagation();
      choose(first.id);
    }
  };

  const count = results?.sections.reduce((sum, section) => sum + section.entries.length, 0) ?? 0;
  const searching = results?.sections.some((section) => section.walking) ?? false;
  return (
    <ModalOverlay className="modal-overlay quick-open-overlay" isOpen isDismissable onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Modal className="modal quick-open">
        <Dialog className="quick-open-dialog" aria-label="Quick open" data-testid="quick-open">
          <div className="quick-open-body" onKeyDownCapture={onKeyDown}>
            <Autocomplete inputValue={query} onInputChange={setQuery}>
              <TextField className="quick-open-field">
                <Label className="visually-hidden">Open a file by name, or type ~/ or / for a path</Label>
                {/* The combobox pattern (UX §7): the list below is always shown, so it's always expanded. */}
                <Input ref={input} role="combobox" aria-expanded className="quick-open-input" placeholder="Search files by name, or type ~/ or /" spellCheck={false} />
              </TextField>
              <ListBox
                className="quick-open-list"
                aria-label="Files"
                data-testid="quick-open-list"
                items={sections}
                onAction={choose}
                renderEmptyState={() => (
                  <p className="quick-open-empty" data-testid="quick-open-empty">
                    {start?.scope ? `No matches in ${start.scope}. ` : 'No matches. '}Type ~/… or /… to open any path.
                  </p>
                )}
              >
                {(section) => (
                  <ListBoxSection id={section.kind} className="quick-open-section">
                    <Header className="quick-open-header">
                      {section.title}
                      {section.walking ? ' · searching…' : section.truncated ? ' · stopped at its limit' : ''}
                    </Header>
                    <Collection items={section.entries}>{(entry) => <Entry entry={entry} />}</Collection>
                  </ListBoxSection>
                )}
              </ListBox>
            </Autocomplete>
            <span className="visually-hidden" role="status" data-testid="quick-open-count">
              {results ? `${count} ${count === 1 ? 'result' : 'results'}${searching ? ', searching' : ''}` : ''}
            </span>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function Entry({ entry }: { entry: QuickOpenEntry }) {
  return (
    <ListBoxItem id={entry.id} textValue={entry.detail ? `${entry.name} ${entry.detail}` : entry.name} className="quick-open-item">
      <span className="quick-open-name">{entry.name}</span>
      {entry.detail && <span className="quick-open-detail">{entry.detail}</span>}
    </ListBoxItem>
  );
}
