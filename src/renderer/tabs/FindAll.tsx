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
import { FIND_ALL_MIN_CHARACTERS, type FindAllResult, type FindAllSkip, type FindHit } from '../../shared/find';
import { tabLabels } from '../../shared/tab-labels';
import type { TabView } from '../../shared/tabs';
import { editors } from '../edit/editors';
import { keepCaretKeys } from '../overlay-keys';

/** Typing pauses this long before the window's tabs are searched. */
const DEBOUNCE_MS = 150;

const SKIPPED: Record<FindAllSkip, string> = {
  missing: 'file not found',
  'no-permission': 'no permission to read',
  'not-a-file': 'not a file',
  unreadable: "couldn't be read",
  'too-large': 'too large',
  binary: 'binary file',
  'too-slow': 'took too long',
};

/** Where Enter or a click takes the reader: a tab, and the match its find bar opens on (none for a tab not searched). */
export type FindAllChoice = { query: string; caseSensitive: boolean; line: number } | null;

type Row = { key: string; id: string; hit: FindHit } | { key: string; id: string; skipped: string };

interface Search {
  query: string;
  caseSensitive: boolean;
  result: Extract<FindAllResult, { kind: 'done' }>;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * Find in all tabs (ADR-024): a field over the source text of this window's tabs, as main searched
 * them. Each tab with matches is a group of its first matches; Enter opens the tab with its find bar
 * on the chosen one. Esc closes, and the search still running stops.
 */
export function FindAll({
  tabs,
  onChoose,
  onClose,
}: {
  /** The window's tabs, named as the tab bar names them. */
  tabs: readonly TabView[];
  onChoose: (id: string, choice: FindAllChoice) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [search, setSearch] = useState<Search | null>(null);
  /** Enter came before main answered what was typed: it takes the first row of that answer. */
  const enterPending = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const searchable = [...query].length >= FIND_ALL_MIN_CHARACTERS;
  const current = searchable && search?.query === query && search.caseSensitive === caseSensitive ? search : null;

  // The field takes the focus (after the dialog's own focus handling, which runs first).
  useEffect(() => input.current?.focus(), []);
  // Closing stops the search main may still be running.
  useEffect(() => () => void window.galeo.documents.findAll('', { caseSensitive: false }), []);

  useEffect(() => {
    if (!searchable) {
      void window.galeo.documents.findAll('', { caseSensitive: false });
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      // Unsaved edits are searched as they are on screen: main gets them before the query.
      for (const editor of editors.values()) editor.keepNow();
      void window.galeo.documents.findAll(query, { caseSensitive }).then((result) => {
        if (live && result.kind === 'done') setSearch({ query, caseSensitive, result });
      });
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, caseSensitive, searchable]);

  const sections = useMemo(() => {
    const labels = tabLabels(tabs.map((tab) => tab.path));
    const names = new Map(tabs.map((tab, index) => [tab.id, tab.folder ? `${labels[index]} — ${tab.folder}` : labels[index]!]));
    const name = (id: string) => names.get(id) ?? 'Closed tab';
    const found = (current?.result.tabs ?? []).flatMap((tab) => {
      if (!('found' in tab)) return [];
      const { count, capped, hits } = tab.found;
      const total = `${count}${capped ? '+' : ''} ${count === 1 && !capped ? 'match' : 'matches'}`;
      const shown = hits.length < count ? `, first ${hits.length} shown` : '';
      return [{ id: tab.id, title: `${name(tab.id)} · ${total}${shown}`, rows: hits.map((hit, index): Row => ({ key: `${tab.id}:${index}`, id: tab.id, hit })) }];
    });
    const skipped = (current?.result.tabs ?? []).flatMap((tab): Row[] => ('skipped' in tab ? [{ key: `skipped:${tab.id}`, id: tab.id, skipped: `${name(tab.id)}: ${SKIPPED[tab.skipped]}` }] : []));
    return skipped.length > 0 ? [...found, { id: 'skipped', title: 'Not searched', rows: skipped }] : found;
  }, [current, tabs]);
  const rows = new Map(sections.flatMap((section) => section.rows.map((row) => [row.key, row] as const)));

  const choose = (key: Key) => {
    const row = rows.get(String(key));
    if (!row) return;
    // The choice first: it can say where focus goes when the overlay closes.
    onChoose(row.id, 'hit' in row ? { query, caseSensitive, line: row.hit.line } : null);
    onClose();
  };
  const first = () => sections[0]?.rows[0];

  const onKeyDown = (event: KeyboardEvent) => {
    if (keepCaretKeys(event) || event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return;
    // The list still answers an earlier query: Enter waits for main's answer to this one.
    if (searchable && !current) {
      event.preventDefault();
      event.stopPropagation();
      enterPending.current = true;
      return;
    }
    // Nothing highlighted: the first match.
    const row = first();
    if (row && !event.currentTarget.querySelector('[role="option"][data-focused]')) {
      event.preventDefault();
      event.stopPropagation();
      choose(row.key);
    }
  };

  useEffect(() => {
    if (!enterPending.current || !current) return;
    enterPending.current = false;
    const row = first();
    if (row) choose(row.key);
  });

  const found = (current?.result.tabs ?? []).filter((tab) => 'found' in tab);
  const matches = found.reduce((sum, tab) => sum + tab.found.count, 0);
  const capped = found.some((tab) => tab.found.capped);
  const status = !searchable
    ? `Type at least ${FIND_ALL_MIN_CHARACTERS} characters`
    : !current
      ? 'Searching…'
      : matches === 0
        ? 'No matches'
        : `${matches}${capped ? '+' : ''} ${matches === 1 && !capped ? 'match' : 'matches'} in ${plural(found.length, 'tab', 'tabs')}`;

  return (
    <ModalOverlay className="modal-overlay quick-open-overlay" isOpen isDismissable onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Modal className="modal quick-open find-all">
        <Dialog className="quick-open-dialog" aria-label="Find in all tabs" data-testid="find-all">
          <div className="quick-open-body" onKeyDownCapture={onKeyDown}>
            <Autocomplete inputValue={query} onInputChange={setQuery}>
              <div className="find-all-field">
                <TextField className="quick-open-field">
                  <Label className="visually-hidden">Find in the source of this window's tabs</Label>
                  {/* The combobox pattern (UX §7): the list below is always shown, so it's always expanded. */}
                  <Input ref={input} role="combobox" aria-expanded className="quick-open-input" placeholder="Find in all tabs (source text)" spellCheck={false} />
                </TextField>
                <button type="button" className="find-all-case" aria-label="Match case" aria-pressed={caseSensitive} title="Match case" onClick={() => setCaseSensitive(!caseSensitive)}>
                  Aa
                </button>
              </div>
              <ListBox
                className="quick-open-list"
                aria-label="Matches"
                data-testid="find-all-list"
                items={sections}
                onAction={choose}
                renderEmptyState={() => (
                  <p className="quick-open-empty" data-testid="find-all-empty">
                    {status}
                  </p>
                )}
              >
                {(section) => (
                  <ListBoxSection id={section.id} className="quick-open-section">
                    <Header className="quick-open-header">{section.title}</Header>
                    <Collection items={section.rows} idScope={section.id}>
                      {(row) =>
                        'hit' in row ? (
                          <ListBoxItem id={row.key} textValue={`line ${row.hit.line}: ${row.hit.before}${row.hit.match}${row.hit.after}`} className="quick-open-item find-all-hit">
                            <span className="find-all-line">{row.hit.line}</span>
                            <span className="find-all-text">
                              {row.hit.before}
                              <mark>{row.hit.match}</mark>
                              {row.hit.after}
                            </span>
                          </ListBoxItem>
                        ) : (
                          <ListBoxItem id={row.key} textValue={row.skipped} className="quick-open-item">
                            {row.skipped}
                          </ListBoxItem>
                        )
                      }
                    </Collection>
                  </ListBoxSection>
                )}
              </ListBox>
            </Autocomplete>
            <span className="visually-hidden" role="status" data-testid="find-all-status">
              {status}
            </span>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
