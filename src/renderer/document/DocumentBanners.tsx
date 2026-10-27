import type { DocumentContent, ChosenEncoding } from '../../shared/contracts';
import type { ViewMode } from '../../shared/formats';
import type { CsvTable } from '../../shared/csv';
import { DocumentBanner, type DiskChange } from './DocumentState';
import { EncodingMenu } from './EncodingMenu';
import { ENCODING_NAMES } from './encodings';
import type { useCsvTable } from './useCsvTable';
import type { useJsonTree } from './useJsonTree';
import type { SyntaxProblem, useRenderedHtml } from './useRenderedHtml';

const PAUSED_BANNERS = { slow: 'preview-slow', syntax: 'preview-syntax', error: 'preview-failed', cancelled: 'preview-failed' } as const;

const syntaxDetail = (syntax: SyntaxProblem | null) => (syntax ? `on line ${syntax.line}: ${syntax.message}` : '');

/** Row counts as the notice writes them: "Showing 1,000,000 of 1,250,000 rows". */
const ROWS = new Intl.NumberFormat('en-US');

type Rendered = ReturnType<typeof useRenderedHtml>;
type Tree = ReturnType<typeof useJsonTree>;
type Table = ReturnType<typeof useCsvTable>;
type BannerAction = { label: string; onAction: () => void };

/** A table that couldn't be read: Try again after an error, else Show as table (ADR-020). */
function tableFailure(table: Extract<Table, { status: 'failed' }>) {
  if (table.reason === 'error') return <DocumentBanner kind="render-failed" onAction={table.retry} />;
  return <DocumentBanner kind={table.reason === 'slow' ? 'render-slow' : 'render-cancelled'} actions={[{ label: 'Show as table', onAction: table.showAnyway }]} />;
}

/** A tree that couldn't be read: too slow is final; a cancelled or failed one can try again. */
function treeFailure(tree: Extract<Tree, { status: 'failed' }>) {
  if (tree.reason === 'slow') return <DocumentBanner kind="render-slow" />;
  if (tree.reason === 'cancelled') return <DocumentBanner kind="render-cancelled" actions={[{ label: 'Try again', onAction: tree.retry }]} />;
  return <DocumentBanner kind="render-failed" onAction={tree.retry} />;
}

/** A render that failed: Render anyway past a budget, the MDX error's place, else Try again. */
function renderFailure(render: Extract<Rendered, { status: 'failed' }>) {
  if (render.reason === 'slow') return <DocumentBanner kind="render-slow" onAction={render.renderAnyway} />;
  if (render.reason === 'cancelled') return <DocumentBanner kind="render-cancelled" actions={[{ label: 'Render anyway', onAction: render.renderAnyway }]} />;
  if (render.reason === 'syntax') return <DocumentBanner kind="syntax-error" detail={syntaxDetail(render.syntax)} />;
  return <DocumentBanner kind="render-failed" onAction={render.retry} />;
}

/** The banners over a shown document, in a fixed order: disk, size, table, tree, encoding, render. */
export function DocumentBanners({
  ready,
  view,
  renderAnyway,
  tabular,
  json,
  disk,
  diskActions,
  render,
  jsonTree,
  csvTable,
  shownTable,
  onShowRendered,
  onChooseEncoding,
}: {
  ready: Extract<DocumentContent, { state: 'ready' }>;
  view: ViewMode;
  /** The reader asked to render a file over the render limit. */
  renderAnyway: boolean;
  tabular: boolean;
  json: boolean;
  disk: DiskChange | null;
  diskActions: Record<DiskChange, BannerAction[]>;
  render: Rendered;
  jsonTree: Tree;
  csvTable: Table;
  /** The table on show, if any (also while a new one is read). */
  shownTable: CsvTable | null;
  onShowRendered: () => void;
  onChooseEncoding?: ((encoding: ChosenEncoding | null) => void) | undefined;
}) {
  return (
    <>
      {disk && <DocumentBanner kind={disk} actions={diskActions[disk]} />}
      {ready.banner === 'too-large' && view === 'source' && !renderAnyway && (
        // Render anyway is Markdown's and the reader's; tables have Show as table (ADR-020); past its
        // limits, JSON is source (ADR-018).
        tabular ? (
          <DocumentBanner kind="too-large" actions={[{ label: 'Show as table', onAction: onShowRendered }]} />
        ) : (
          <DocumentBanner kind="too-large" {...(json ? {} : { onAction: onShowRendered })} />
        )
      )}
      {csvTable.status === 'too-large' && view === 'source' && <DocumentBanner kind="too-large" />}
      {csvTable.status === 'failed' && tableFailure(csvTable)}
      {csvTable.status === 'paused' && <DocumentBanner kind={PAUSED_BANNERS[csvTable.reason]} />}
      {shownTable && shownTable.totalRows > shownTable.rows && view !== 'source' && (
        <DocumentBanner kind="rows-capped" detail={`Showing ${ROWS.format(shownTable.rows - 1)} of ${ROWS.format(shownTable.totalRows - 1)} rows`} />
      )}
      {jsonTree.status === 'too-large' && view === 'source' && <DocumentBanner kind="too-large" />}
      {jsonTree.status === 'invalid' && <DocumentBanner kind="json-invalid" detail={`line ${jsonTree.line}, column ${jsonTree.column}`} />}
      {jsonTree.status === 'failed' && treeFailure(jsonTree)}
      {ready.guessedEncoding && (
        <DocumentBanner kind="encoding" detail={ENCODING_NAMES[ready.encoding]}>
          {onChooseEncoding && <EncodingMenu onChoose={onChooseEncoding}>Reopen with encoding…</EncodingMenu>}
        </DocumentBanner>
      )}
      {render.status === 'paused' && <DocumentBanner kind={PAUSED_BANNERS[render.reason]} detail={syntaxDetail(render.syntax)} />}
      {render.status === 'failed' && renderFailure(render)}
    </>
  );
}
