import type { FormatId } from '../../shared/formats';
import { tabLabels } from '../../shared/tab-labels';
import { FORMAT_NAMES } from '../document/formats';
import { indicators, type Indicator } from './indicators';
import type { TabsView } from './store';

/** A card in the tab overview (UX F17): what the tab bar says about a tab, plus its folder and format. */
export interface OverviewCard {
  id: string;
  label: string;
  /** The tab's folder as the reader sees it (`~/…`); empty for the settings tab. */
  folder: string;
  /** A short badge for the format, shown only; `format` is what a screen reader hears. */
  badge: string;
  format: string | null;
  indicators: Indicator[];
  active: boolean;
  /** "3 of 9", in the card's accessible name. */
  position: string;
}

const BADGES: Readonly<Record<FormatId, string>> = {
  markdown: 'MD',
  mdx: 'MDX',
  text: 'TXT',
  log: 'LOG',
  json: 'JSON',
  jsonl: 'JSONL',
  yaml: 'YAML',
  toml: 'TOML',
  csv: 'CSV',
  tsv: 'TSV',
  code: 'CODE',
  plain: 'TXT',
};

/** The window's tabs as overview cards, in tab order. */
export function overviewCards(view: Pick<TabsView, 'tabs' | 'active' | 'statuses' | 'reloaded' | 'crashed'>): OverviewCard[] {
  const labels = tabLabels(view.tabs.map((tab) => tab.path));
  return view.tabs.map((tab, index) => {
    const settings = tab.kind === 'settings';
    const format = tab.format ?? 'plain';
    return {
      id: tab.id,
      label: settings ? 'Settings' : labels[index]!,
      folder: tab.folder ?? '',
      badge: settings ? '⚙' : BADGES[format],
      format: settings ? null : FORMAT_NAMES[format],
      indicators: indicators(view.statuses.get(tab.id), view.reloaded.has(tab.id), view.crashed.has(tab.id)),
      active: tab.id === view.active,
      position: `${index + 1} of ${view.tabs.length}`,
    };
  });
}

/**
 * Where a card dropped before or after another lands in the new order, as `store.move` takes it;
 * null when the drop leaves it where it was.
 */
export function droppedAt(ids: readonly string[], id: string, target: string, where: 'before' | 'after'): number | null {
  const from = ids.indexOf(id);
  const at = ids.indexOf(target);
  if (from < 0 || at < 0) return null;
  const insertion = where === 'before' ? at : at + 1;
  const to = insertion > from ? insertion - 1 : insertion;
  return to === from ? null : to;
}
