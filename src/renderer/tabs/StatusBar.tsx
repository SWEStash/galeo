import type { ReactNode } from 'react';
import type { ChosenEncoding } from '../../shared/contracts';
import { EncodingMenu } from '../document/EncodingMenu';
import { ENCODING_NAMES } from '../document/encodings';
import type { TabStatus, TabStore, TabsView } from './store';

const VIEW_NAMES = { rendered: 'Rendered', source: 'Source' } as const;

/** `.txt` shows its rendered view as reader text (UX F10). */
const viewName = (status: TabStatus) => (status.format === 'text' && status.view === 'rendered' ? 'Reader' : VIEW_NAMES[status.view!]);

/**
 * The status bar (UX §2): the shown tab's path (a menu to copy or reveal it), view, read-only,
 * encoding (a menu to reopen it with another), line count and zoom; then the window's messages.
 */
export function StatusBar({ view, store, children }: { view: TabsView; store: TabStore; children: ReactNode }) {
  const tab = view.tabs.find((each) => each.id === view.active);
  const status = tab && view.statuses.get(tab.id);
  const zoom = tab ? (view.zooms.get(tab.id) ?? 1) : 1;
  const chooseEncoding = (encoding: ChosenEncoding | null) => {
    if (tab) void window.galeo.documents.setEncoding(tab.id, encoding).then(() => store.reread(tab.id));
  };
  return (
    <footer className="status-bar" data-testid="status-bar">
      {tab && (
        <button
          type="button"
          className="status-path"
          data-testid="status-path"
          title={`${tab.path} — copy or reveal`}
          onClick={() => void window.galeo.documents.pathMenu(tab.id)}
        >
          {tab.path}
        </button>
      )}
      {status?.view && <span data-testid="status-view">{viewName(status)}</span>}
      {status?.view && <span data-testid="status-mode">Read-only</span>}
      {status?.encoding && (
        <EncodingMenu className="status-encoding" onChoose={chooseEncoding}>
          <span data-testid="status-encoding">{ENCODING_NAMES[status.encoding]}</span>
        </EncodingMenu>
      )}
      {status?.lines != null && <span data-testid="status-lines">{status.lines.toLocaleString('en')} ln</span>}
      {zoom !== 1 && <span data-testid="status-zoom">{Math.round(zoom * 100)}%</span>}
      {children}
    </footer>
  );
}
