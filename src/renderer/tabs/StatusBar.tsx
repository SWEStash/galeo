import type { ReactNode } from 'react';
import type { ChosenEncoding } from '../../shared/contracts';
import { useDispatcher } from '../commands/useCommands';
import { EncodingMenu } from '../document/EncodingMenu';
import { TableOptionsMenu } from '../document/TableOptionsMenu';
import { ENCODING_NAMES } from '../document/encodings';
import { RENDERED_VIEW_NAMES } from '../document/formats';
import { widthLabel } from '../document/width';
import { unlessClosed } from './closed-tab';
import { metricsLabel } from './metrics';
import type { TabStatus, TabStore, TabsView } from './store';

const VIEW_NAMES = { rendered: 'Rendered', source: 'Source', split: 'Split' } as const;

/** `.txt` shows its rendered view as reader text (UX F10), JSON as a tree, CSV and any text shown as a table as one (UX F14, ADR-021). */
function viewName(status: TabStatus): string {
  if (status.view !== 'rendered') return VIEW_NAMES[status.view!];
  if (status.table) return 'Table';
  return (status.format ? RENDERED_VIEW_NAMES[status.format] : undefined) ?? VIEW_NAMES.rendered;
}

/**
 * The status bar (UX §2): the shown tab's path (a menu to copy or reveal it), view, read-only,
 * encoding (a menu to reopen it with another), the document's metrics, zoom and reader width; then the window's
 * messages.
 */
export function StatusBar({ view, store, say, children }: { view: TabsView; store: TabStore; say: (message: string) => void; children: ReactNode }) {
  const tab = view.tabs.find((each) => each.id === view.active);
  const status = tab && view.statuses.get(tab.id);
  const zoom = tab ? (view.zooms.get(tab.id) ?? 1) : 1;
  const width = tab && view.widths.get(tab.id);
  const metrics = status ? metricsLabel(status.lines, status.words) : null;
  const dispatcher = useDispatcher();
  const chooseEncoding = (encoding: ChosenEncoding | null) => {
    if (tab) void window.galeo.documents.setEncoding(tab.id, encoding).then(() => store.reread(tab.id), unlessClosed(say, "The encoding didn't change"));
  };
  return (
    <footer className="status-bar" data-testid="status-bar">
      {tab && tab.kind !== 'settings' && (
        <button
          type="button"
          className="status-path"
          data-testid="status-path"
          title={`${tab.path} — copy or reveal`}
          onClick={() => void window.galeo.documents.pathMenu(tab.id).catch(unlessClosed(say, "The file's menu couldn't open"))}
        >
          {tab.path}
        </button>
      )}
      {status?.view && <span data-testid="status-view">{viewName(status)}</span>}
      {status?.view && <span data-testid="status-mode">{status.editing ? 'Editing' : 'Read-only'}</span>}
      {status?.encoding && (
        <EncodingMenu className="status-encoding" onChoose={chooseEncoding}>
          <span data-testid="status-encoding">{ENCODING_NAMES[status.encoding]}</span>
        </EncodingMenu>
      )}
      {status?.table && <TableOptionsMenu className="status-table" options={status.table} onCommand={(command) => dispatcher.run(command)} />}
      {metrics && <span data-testid="status-metrics">{metrics}</span>}
      {zoom !== 1 && <span data-testid="status-zoom">{Math.round(zoom * 100)}%</span>}
      {/* Only while the tab differs from the measure setting, as zoom shows only away from 100 %. */}
      {width && <span data-testid="status-width">{widthLabel(width)}</span>}
      {/* Said once, politely: the shown file took a new version from disk (UX §7). */}
      <span className="status-reloaded" data-testid="status-reloaded" role="status">
        {tab && view.reloaded.has(tab.id) ? '↻ Reloaded' : ''}
      </span>
      {children}
    </footer>
  );
}
