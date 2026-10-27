import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Autocomplete, Dialog, Input, Label, ListBox, ListBoxItem, Modal, ModalOverlay, TextField, useFilter, type Key } from 'react-aria-components';
import type { Platform } from '../../shared/keymap';
import { paletteEntries, type PaletteEntry } from './entries';
import { plural } from '../../shared/words';

/**
 * The command palette (Ctrl+Shift+P, UX §5): every command by name, with its keys. Enter runs the
 * highlighted one (the first match when none is), Esc closes. Capability entries only name their
 * key; what each entry does is the window's business (`onChoose`).
 */
export function Palette({ platform, onChoose, onClose }: { platform: Platform; onChoose: (entry: PaletteEntry) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const { contains } = useFilter({ sensitivity: 'base' });
  const all = useMemo(() => paletteEntries(platform), [platform]);
  // A stable list: the collection rebuilds whenever its items change identity.
  const shown = useMemo(() => all.filter((entry) => contains(entry.label, query.trim())), [all, contains, query]);

  // The field takes the focus (after the dialog's own focus handling, which runs first).
  useEffect(() => input.current?.focus(), []);

  const choose = (key: Key) => {
    const entry = all.find((each) => each.id === key);
    if (entry) onChoose(entry);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || input.current?.getAttribute('aria-activedescendant')) return;
    const first = shown[0];
    if (!first) return;
    event.preventDefault();
    event.stopPropagation();
    onChoose(first);
  };

  return (
    <ModalOverlay className="modal-overlay quick-open-overlay" isOpen isDismissable onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Modal className="modal quick-open">
        <Dialog className="quick-open-dialog" aria-label="Command palette" data-testid="palette">
          <div className="quick-open-body" onKeyDownCapture={onKeyDown}>
            <Autocomplete inputValue={query} onInputChange={setQuery}>
              <TextField className="quick-open-field">
                <Label className="visually-hidden">Run a command by name</Label>
                {/* The combobox pattern (UX §7): the list below is always shown, so it's always expanded. */}
                <Input ref={input} role="combobox" aria-expanded className="quick-open-input" placeholder="Type a command" spellCheck={false} />
              </TextField>
              <ListBox
                className="quick-open-list"
                aria-label="Commands"
                data-testid="palette-list"
                items={shown}
                onAction={choose}
                renderEmptyState={() => (
                  <p className="quick-open-empty" data-testid="palette-empty">
                    No commands match.
                  </p>
                )}
              >
                {(entry) => (
                  <ListBoxItem id={entry.id} textValue={entry.label} className="quick-open-item palette-item">
                    <span className="palette-label">{entry.label}</span>
                    {entry.keys.length > 0 && (
                      <span className="palette-keys">
                        {entry.keys.map((key) => (
                          <kbd key={key}>{key}</kbd>
                        ))}
                      </span>
                    )}
                  </ListBoxItem>
                )}
              </ListBox>
            </Autocomplete>
            <span className="visually-hidden" role="status" data-testid="palette-count">
              {plural(shown.length, 'command', 'commands')}
            </span>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
