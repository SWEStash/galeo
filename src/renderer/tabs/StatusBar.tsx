import type { ReactNode } from 'react';
import { Button, Menu, MenuItem, MenuSection, MenuTrigger, Popover, Separator as MenuSeparator } from 'react-aria-components';
import type { Command } from '../../shared/keymap';
import type { ChosenEncoding } from '../../shared/contracts';
import { useDispatcher } from '../commands/useCommands';
import { EncodingMenu } from '../document/EncodingMenu';
import { TableOptionsMenu } from '../document/TableOptionsMenu';
import { ENCODING_NAMES } from '../document/encodings';
import { RENDERED_VIEW_NAMES } from '../document/formats';
import { widthLabel } from '../document/width';
import { Icon } from '../ui/icons';
import { unlessClosed } from './closed-tab';
import { metricsLabel, tasksLabel } from './metrics';
import { shownTab, type TabStatus, type TabStore, type TabsView } from './store';

const VIEW_NAMES = { rendered: 'Rendered', source: 'Source', split: 'Split' } as const;

/** `.txt` shows its rendered view as reader text (UX F10), JSON as a tree, CSV and any text shown as a table as one (UX F14, ADR-021). */
function viewName(status: TabStatus): string {
  if (status.view !== 'rendered') return VIEW_NAMES[status.view!];
  if (status.table) return 'Table';
  return (status.format ? RENDERED_VIEW_NAMES[status.format] : undefined) ?? VIEW_NAMES.rendered;
}

const VIEW_COMMANDS = { rendered: 'viewRendered', source: 'viewSource', split: 'viewSplit' } as const satisfies Record<string, Command>;

/**
 * The view's name as a menu (mouse paths review): the views the document has, then Wrap and the
 * outline where they apply. Each choice runs the command the palette runs.
 */
function ViewMenu({ status, onCommand }: { status: TabStatus; onCommand: (command: Command) => void }) {
  const options = status.options;
  const name = viewName(status);
  const views = (['rendered', 'source', 'split'] as const).filter((each) => each === 'source' || (each === 'rendered' ? options?.rendered : options?.split));
  const toggles = [options?.wrap !== null && options?.wrap !== undefined ? 'toggleWrap' : null, options?.outline !== null && options?.outline !== undefined ? 'toggleOutline' : null].filter(
    (each): each is 'toggleWrap' | 'toggleOutline' => each !== null,
  );
  const on = [options?.wrap ? 'toggleWrap' : null, options?.outline ? 'toggleOutline' : null].filter((each) => each !== null);
  return (
    <MenuTrigger>
      <Button className="status-view" aria-label={`View: ${name}`}>
        <span data-testid="status-view">{name}</span>
        <Icon name="chevron-down" />
      </Button>
      <Popover className="menu-popover" placement="top start">
        <Menu className="menu" aria-label="View" onAction={(key) => onCommand(key as Command)}>
          <MenuSection selectionMode="single" selectedKeys={status.view ? [VIEW_COMMANDS[status.view]] : []} aria-label="Views">
            {views.map((each) => (
              <MenuItem key={each} id={VIEW_COMMANDS[each]} className="menu-item">
                {VIEW_NAMES[each]}
              </MenuItem>
            ))}
          </MenuSection>
          {toggles.length > 0 && <MenuSeparator />}
          {toggles.length > 0 && (
            <MenuSection selectionMode="multiple" selectedKeys={on} aria-label="Options">
              {toggles.map((each) => (
                <MenuItem key={each} id={each} className="menu-item">
                  {each === 'toggleWrap' ? 'Wrap' : 'Outline'}
                </MenuItem>
              ))}
            </MenuSection>
          )}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

/**
 * The status bar (UX §2): the shown tab's path (a menu to copy or reveal it), view (a menu), read-only,
 * encoding (a menu to reopen it with another), the document's metrics, Follow for a log, zoom and reader
 * width (a click resets each); then the window's messages.
 */
export function StatusBar({ view, store, say, children }: { view: TabsView; store: TabStore; say: (message: string) => void; children: ReactNode }) {
  const tab = shownTab(view);
  const status = tab && view.statuses.get(tab.id);
  const zoom = tab ? (view.zooms.get(tab.id) ?? 1) : 1;
  const width = tab && view.widths.get(tab.id);
  const metrics = status ? metricsLabel(status.lines, status.words) : null;
  const tasks = tasksLabel(status?.tasks ?? null);
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
      {status?.view && <ViewMenu status={status} onCommand={(command) => dispatcher.run(command)} />}
      {status?.view && (
        <span className="status-mode" data-testid="status-mode" data-editing={status.editing || undefined}>
          {status.editing ? 'Editing' : 'Read-only'}
        </span>
      )}
      {status?.encoding && (
        <EncodingMenu className="status-encoding" onChoose={chooseEncoding}>
          <span data-testid="status-encoding">{ENCODING_NAMES[status.encoding]}</span>
        </EncodingMenu>
      )}
      {status?.table && <TableOptionsMenu className="status-table" options={status.table} onCommand={(command) => dispatcher.run(command)} />}
      {metrics && <span data-testid="status-metrics">{metrics}</span>}
      {tasks && <span data-testid="status-tasks">{tasks}</span>}
      {status?.changes && <span data-testid="status-changes">{status.changes}</span>}
      {status?.options?.followable && (
        <button type="button" className="status-follow" data-testid="status-follow" aria-pressed={status.follow} title="Follow the end (End)" onClick={() => dispatcher.run('toggleFollow')}>
          ⇣ Follow
        </button>
      )}
      {zoom !== 1 && (
        <button type="button" className="status-zoom" aria-label={`Zoom ${Math.round(zoom * 100)}%, reset`} title="Reset zoom (Ctrl+0)" onClick={() => dispatcher.run('zoomReset')}>
          <span data-testid="status-zoom">{Math.round(zoom * 100)}%</span>
        </button>
      )}
      {/* Only while the tab differs from the measure setting, as zoom shows only away from 100 %. */}
      {width && (
        <button type="button" className="status-width" aria-label={`Reader width ${widthLabel(width)}, reset`} title="Reset reader width (Alt+0)" onClick={() => dispatcher.run('resetReaderWidth')}>
          <span data-testid="status-width">{widthLabel(width)}</span>
        </button>
      )}
      {/* Said once, politely: the shown file took a new version from disk (UX §7). */}
      <span className="status-reloaded" data-testid="status-reloaded" role="status">
        {tab && view.reloaded.has(tab.id) ? '↻ Reloaded' : ''}
      </span>
      {children}
    </footer>
  );
}
