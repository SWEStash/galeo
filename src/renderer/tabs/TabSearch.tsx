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
import type { TabHit, TabSearchResults } from '../../shared/tabs';
import { keepCaretKeys } from '../overlay-keys';
import { plural } from '../../shared/words';
import { reportFailure } from './closed-tab';

interface Row extends TabHit {
  /** Unique in the list: an open tab and a closed one are told apart. */
  key: string;
  closed: boolean;
}

/**
 * Tab search (UX F16): a field over the window's open tabs and its recently closed ones, as main
 * matched them. Enter shows an open tab or reopens a closed one where it was; Esc closes.
 */
export function TabSearch({ onShow, onReopen, onClose, say }: { onShow: (id: string) => void; onReopen: (id: string) => void; onClose: () => void; say: (message: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TabSearchResults | null>(null);
  /** Enter came before main answered what was typed: it takes the first result of that answer. */
  const enterPending = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  // The field takes the focus (after the dialog's own focus handling, which runs first).
  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    let current = true;
    void window.galeo.tabs.search(query).then((next) => {
      if (current && next.query === query) setResults(next);
    }, (error: unknown) => current && reportFailure(say, "Couldn't search the tabs")(error));
    return () => {
      current = false;
    };
  }, [query]);

  const sections = useMemo(() => {
    const rows = (hits: TabHit[], closed: boolean): Row[] => hits.map((hit) => ({ ...hit, key: `${closed ? 'closed' : 'open'}:${hit.id}`, closed }));
    return [
      { id: 'open', title: 'Open tabs', rows: rows(results?.open ?? [], false) },
      { id: 'closed', title: 'Recently closed', rows: rows(results?.closed ?? [], true) },
    ].filter((section) => section.rows.length > 0);
  }, [results]);
  const rows = new Map(sections.flatMap((section) => section.rows.map((row) => [row.key, row] as const)));

  const choose = (key: Key) => {
    const row = rows.get(String(key));
    if (!row) return;
    onClose();
    if (row.closed) onReopen(row.id);
    else onShow(row.id);
  };
  const first = () => sections[0]?.rows[0];

  const onKeyDown = (event: KeyboardEvent) => {
    if (keepCaretKeys(event) || event.key !== 'Enter') return;
    // The list still answers an earlier query: Enter waits for main's answer to this one.
    if (results?.query !== query) {
      event.preventDefault();
      event.stopPropagation();
      enterPending.current = true;
      return;
    }
    // Nothing highlighted: the first result.
    const row = first();
    if (row && !event.currentTarget.querySelector('[role="option"][data-focused]')) {
      event.preventDefault();
      event.stopPropagation();
      choose(row.key);
    }
  };

  useEffect(() => {
    if (!enterPending.current || results?.query !== query) return;
    enterPending.current = false;
    const row = first();
    if (row) choose(row.key);
  });

  const count = rows.size;
  return (
    <ModalOverlay className="modal-overlay quick-open-overlay" isOpen isDismissable onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Modal className="modal quick-open">
        <Dialog className="quick-open-dialog" aria-label="Search tabs" data-testid="tab-search">
          <div className="quick-open-body" onKeyDownCapture={onKeyDown}>
            <Autocomplete inputValue={query} onInputChange={setQuery}>
              <TextField className="quick-open-field">
                <Label className="visually-hidden">Search this window's open and recently closed tabs</Label>
                {/* The combobox pattern (UX §7): the list below is always shown, so it's always expanded. */}
                <Input ref={input} role="combobox" aria-expanded className="quick-open-input" placeholder="Search tabs by name or folder" spellCheck={false} />
              </TextField>
              <ListBox
                className="quick-open-list"
                aria-label="Tabs"
                data-testid="tab-search-list"
                items={sections}
                onAction={choose}
                renderEmptyState={() => (
                  <p className="quick-open-empty" data-testid="tab-search-empty">
                    No tab matches.
                  </p>
                )}
              >
                {(section) => (
                  <ListBoxSection id={section.id} className="quick-open-section">
                    <Header className="quick-open-header">{section.title}</Header>
                    <Collection items={section.rows} idScope={section.id}>
                      {(row) => (
                        <ListBoxItem id={row.key} textValue={`${row.name} ${row.detail}`} className="quick-open-item">
                          <span className="quick-open-name">{row.name}</span>
                          <span className="quick-open-detail">{row.detail}</span>
                        </ListBoxItem>
                      )}
                    </Collection>
                  </ListBoxSection>
                )}
              </ListBox>
            </Autocomplete>
            <span className="visually-hidden" role="status" data-testid="tab-search-count">
              {results ? plural(count, 'tab', 'tabs') : ''}
            </span>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
