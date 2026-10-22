/** The side panel's tabs (ADR-023): what a row, a collapsed marker and the title bar show. */

import { fileName } from '../../shared/paths';
import type { TabView } from '../../shared/tabs';
import { indicators, type Indicator } from './indicators';
import type { TabStatus } from './store';

/** A row's name: the file's own; the folder line below it tells tabs of the same name apart. */
export function rowName(tab: TabView): string {
  return tab.kind === 'settings' ? 'Settings' : fileName(tab.path);
}

/** The marks a collapsed marker has room for, most pressing first: it shows one. */
const MARKER_MARKS = ['crashed the viewer', 'file missing', 'unsaved changes', 'following the end'];

/** A collapsed tab: the name's first letter or digit (a gear for Settings), and its most pressing mark. */
export function markerOf(tab: TabView, status: TabStatus | undefined, reloaded: boolean, crashed: boolean): { letter: string; mark: Indicator | null } {
  const letter = tab.kind === 'settings' ? '⚙' : (/[\p{L}\p{N}]/u.exec(rowName(tab))?.[0]?.toLocaleUpperCase() ?? '•');
  const shown = indicators(status, reloaded, crashed);
  const mark = MARKER_MARKS.map((words) => shown.find((each) => each.words === words)).find(Boolean) ?? null;
  return { letter, mark };
}

/** The title bar's text with tabs on the left: the shown tab's name and folder. */
export function titleText(tabs: readonly TabView[], active: string | null): string {
  const tab = tabs.find((each) => each.id === active);
  if (!tab) return '';
  return tab.folder ? `${rowName(tab)} — ${tab.folder}` : rowName(tab);
}
