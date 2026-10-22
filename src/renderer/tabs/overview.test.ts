import { describe, expect, it } from 'vitest';
import type { TabView } from '../../shared/tabs';
import { droppedAt, overviewCards } from './overview';
import type { TabStatus } from './store';

const status = (change: Partial<TabStatus>): TabStatus => ({
  state: 'ready',
  format: 'markdown',
  view: 'rendered',
  encoding: 'utf-8',
  lines: null,
  words: null,
  follow: false,
  editing: false,
  dirty: false,
  ...change,
});

const tabs: TabView[] = [
  { id: 'a', path: '/home/me/acme/README.md', format: 'markdown', folder: '~/acme' },
  { id: 'b', path: '/home/me/beta/README.md', format: 'markdown', folder: '~/beta' },
  { id: 's', path: '', kind: 'settings' },
  { id: 'c', path: '/srv/logs/app.log', format: 'log', folder: '/srv/logs' },
];

const view = (change: Partial<Parameters<typeof overviewCards>[0]> = {}) => ({
  tabs,
  active: 'b',
  statuses: new Map<string, TabStatus>(),
  reloaded: new Set<string>(),
  crashed: new Set<string>(),
  ...change,
});

describe('overviewCards', () => {
  it('gives a card per tab in tab order: its label as the tab bar shows it, folder, format and position', () => {
    expect(overviewCards(view())).toEqual([
      { id: 'a', label: 'acme/README.md', folder: '~/acme', badge: 'MD', format: 'Markdown', indicators: [], active: false, position: '1 of 4' },
      { id: 'b', label: 'beta/README.md', folder: '~/beta', badge: 'MD', format: 'Markdown', indicators: [], active: true, position: '2 of 4' },
      { id: 's', label: 'Settings', folder: '', badge: '⚙', format: null, indicators: [], active: false, position: '3 of 4' },
      { id: 'c', label: 'app.log', folder: '/srv/logs', badge: 'LOG', format: 'log', indicators: [], active: false, position: '4 of 4' },
    ]);
  });

  it("shows each tab's indicators, with their words", () => {
    const cards = overviewCards(
      view({
        statuses: new Map([
          ['a', status({ editing: true, dirty: true })],
          ['c', status({ format: 'log', follow: true })],
        ]),
        reloaded: new Set(['b']),
      }),
    );
    expect(cards.map((card) => card.indicators.map((each) => each.words))).toEqual([['edit mode', 'unsaved changes'], ['reloaded from disk'], [], ['following the end']]);
  });

  it('names a tab whose format main has not told yet as a plain file', () => {
    const [card] = overviewCards(view({ tabs: [{ id: 'x', path: '/x/notes' }], active: 'x' }));
    expect(card).toMatchObject({ label: 'notes', folder: '', badge: 'TXT', format: 'plain text', position: '1 of 1' });
  });
});

describe('droppedAt', () => {
  const ids = ['a', 'b', 'c', 'd'];
  it("gives the place in the new order of a card dropped before or after another", () => {
    expect(droppedAt(ids, 'a', 'c', 'after')).toBe(2);
    expect(droppedAt(ids, 'a', 'c', 'before')).toBe(1);
    expect(droppedAt(ids, 'd', 'a', 'before')).toBe(0);
    expect(droppedAt(ids, 'd', 'b', 'after')).toBe(2);
    expect(droppedAt(ids, 'b', 'd', 'after')).toBe(3);
  });

  it('is null where nothing moves or a card is unknown', () => {
    expect(droppedAt(ids, 'b', 'a', 'after')).toBeNull();
    expect(droppedAt(ids, 'b', 'c', 'before')).toBeNull();
    expect(droppedAt(ids, 'x', 'a', 'before')).toBeNull();
    expect(droppedAt(ids, 'a', 'x', 'before')).toBeNull();
  });
});
