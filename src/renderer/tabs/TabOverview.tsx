import { useEffect, useRef, useSyncExternalStore, type FocusEvent, type KeyboardEvent } from 'react';
import { Dialog, GridList, GridListItem, Modal, ModalOverlay, useDragAndDrop } from 'react-aria-components';
import type { Command } from '../../shared/keymap';
import { useCommands } from '../commands/useCommands';
import { tabAction } from './commands';
import { CARD_TYPE } from './drag-types';
import { droppedAt, overviewCards, type OverviewCard } from './overview';
import type { TabStore } from './store';

export type OverviewStore = Pick<TabStore, 'subscribe' | 'getSnapshot' | 'activate' | 'close' | 'move'>;

/**
 * The tab overview (UX F17): the window's tabs as a grid of cards, in tab order. Arrows move between
 * cards, Enter or a click shows that tab, Delete or Ctrl+W closes it, Ctrl+Shift+PgUp/PgDn move it;
 * dragging a card moves it too. Esc (or Ctrl+Shift+E again) closes the overview.
 */
export function TabOverview({ store, onClose }: { store: OverviewStore; onClose: () => void }) {
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const cards = overviewCards(view);
  const grid = useRef<HTMLDivElement>(null);
  /** The focused card, and where it was: when its tab closes, the card now there takes the focus. */
  const focused = useRef<{ id: string; index: number } | null>(null);

  const focusCard = (id: string | undefined) => {
    if (id) grid.current?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`)?.focus();
  };

  // The shown tab's card takes the focus, once the dialog's own focus handling has run.
  useEffect(() => {
    const frame = requestAnimationFrame(() => focusCard(store.getSnapshot().active ?? cards[0]?.id));
    return () => cancelAnimationFrame(frame);
    // On open only.
  }, []);

  const ids = cards.map((card) => card.id).join(' ');
  useEffect(() => {
    if (cards.length === 0) return onClose();
    const was = focused.current;
    if (was && !cards.some((card) => card.id === was.id)) focusCard(cards[Math.min(was.index, cards.length - 1)]!.id);
    // When the window's tabs change, not on every render.
  }, [ids]);

  const focusedId = () => focused.current?.id ?? null;
  const onCard = (command: Command) => () => {
    const id = focusedId();
    if (!id) return false;
    const action = tabAction(command, null, { tabs: store.getSnapshot().tabs, active: id });
    if (action?.kind === 'move') store.move(action.id, action.position);
    else if (action?.kind === 'close') store.close(action.id);
    // At an end, the key still belongs to the overview.
    return true;
  };
  useCommands({ moveTabLeft: onCard('moveTabLeft'), moveTabRight: onCard('moveTabRight'), closeTab: onCard('closeTab'), tabOverview: onClose });

  // Dragging a card moves its tab within the window; the card type is one no other drop area takes.
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ [CARD_TYPE]: String(key) })),
    onReorder: ({ keys, target }) => {
      const id = String([...keys][0]);
      const tabs = store.getSnapshot().tabs.map((tab) => tab.id);
      const to = target.dropPosition === 'on' ? null : droppedAt(tabs, id, String(target.key), target.dropPosition);
      if (to !== null) store.move(id, to);
    },
  });

  const show = (id: string) => {
    store.activate(id);
    onClose();
  };

  const onKeyDownCapture = (event: KeyboardEvent) => {
    // Ctrl+Shift+PgUp/PgDn move the card (the command above): the grid must not page with them too.
    if ((event.key === 'PageUp' || event.key === 'PageDown') && (event.ctrlKey || event.metaKey)) event.stopPropagation();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const id = focusedId();
    if (event.key !== 'Delete' || !id) return;
    event.preventDefault();
    store.close(id);
  };
  const onFocus = (event: FocusEvent) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('[data-card-id]');
    const id = card?.dataset['cardId'];
    if (id) focused.current = { id, index: cards.findIndex((each) => each.id === id) };
  };

  return (
    <ModalOverlay className="modal-overlay tab-overview-overlay" isOpen isDismissable onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Modal className="modal tab-overview">
        <Dialog className="tab-overview-dialog" aria-label="Tab overview" data-testid="tab-overview">
          <div onKeyDownCapture={onKeyDownCapture} onKeyDown={onKeyDown} onFocus={onFocus}>
            <GridList ref={grid} layout="grid" aria-label="Tabs in this window" className="tab-overview-grid" items={cards} onAction={(key) => show(String(key))} dragAndDropHooks={dragAndDropHooks}>
              {(card) => <Card card={card} onClose={() => store.close(card.id)} />}
            </GridList>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function Card({ card, onClose }: { card: OverviewCard; onClose: () => void }) {
  const words = [...card.indicators.map((each) => each.words), card.format, card.active ? 'shown now' : null, card.position].filter(Boolean);
  return (
    <GridListItem id={card.id} textValue={card.label} className="tab-overview-card" data-testid="overview-card" data-card-id={card.id} data-active={card.active || undefined}>
      <span className="tab-overview-badge" aria-hidden="true">
        {card.badge}
      </span>
      <span className="tab-overview-label">{card.label}</span>
      {card.indicators.length > 0 && (
        <span className="tab-overview-indicators" aria-hidden="true">
          {card.indicators.map(({ glyph, words: title }) => (
            <span key={glyph} className="tab-indicator" title={title}>
              {glyph}
            </span>
          ))}
        </span>
      )}
      <span className="tab-overview-folder">{card.folder}</span>
      <span className="visually-hidden">, {words.join(', ')}</span>
      {/* Pointer only: a card can't hold another control, and Delete closes it from the keyboard. */}
      <span
        className="tab-overview-close"
        aria-hidden="true"
        title="Close (Delete)"
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        ✕
      </span>
    </GridListItem>
  );
}
