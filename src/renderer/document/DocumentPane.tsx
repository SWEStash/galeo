import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChosenEncoding, DocumentContent, Recovered } from '../../shared/contracts';
import type { ImageResult, SaveResult } from '../../shared/documents';
import { DiffDialog } from '../edit/DiffDialog';
import type { Editor } from '../edit/editors';
import { workerFormat, type ViewMode } from '../../shared/formats';
import { fileName } from '../../shared/paths';
import { useCommands } from '../commands/useCommands';
import { OutlinePanel } from '../outline/OutlinePanel';
import { useOutline } from '../outline/useOutline';
import type { SeparatorChoice } from '../../shared/csv';
import type { ScrollAnchor, TableDefaults, TableOptions, TabViewState } from '../../shared/tabs';
import type { TabStatus } from '../tabs/store';
import type { RenderClient } from '../worker/client';
import type { OutlineEntry } from '../worker/pipeline/render';
import { DocumentBanner, DocumentLoading, DocumentState, type DiskChange } from './DocumentState';
import { EncodingMenu } from './EncodingMenu';
import { ENCODING_NAMES } from './encodings';
import { DocumentView, type DocumentHandle, type RenderedContent } from './DocumentView';
import { FindBar } from './FindBar';
import type { ColorScheme } from './host';
import { FORMAT_NAMES, sourceLanguage } from './formats';
import { useDelayed } from './useDelayed';
import { useLatest } from './useLatest';
import { countWords } from '../../shared/words';
import { ZoomViewer } from './ZoomViewer';
import { pauseOrMax } from './pause-or-max';
import { settleFocus } from './settle-focus';
import { useCsvTable } from './useCsvTable';
import { useJsonTree } from './useJsonTree';
import { useRenderedHtml, type SyntaxProblem } from './useRenderedHtml';
import { afterToggleSource, afterToggleSplit, shownView, viewForEditing, type SingleView, type ViewToggle } from './view-modes';
import type { EditRequest, FindRequest } from './requests';
import { countLines, DISK_UNSAVED, formatView, notSaved } from './pane-model';
import { useFind } from './useFind';
import { useZoomViewer } from './useZoomViewer';

const PAUSED_BANNERS = { slow: 'preview-slow', syntax: 'preview-syntax', error: 'preview-failed', cancelled: 'preview-failed' } as const;

const syntaxDetail = (syntax: SyntaxProblem | null) => (syntax ? `on line ${syntax.line}: ${syntax.message}` : '');

/** A render slower than this shows the loading skeleton (UX: nothing flashes under 150 ms). */
const LOADING_DELAY_MS = 150;

/** A render this long offers Cancel (ADR-020). */
const CANCEL_AFTER_MS = 5000;

/** A table's options with no settings to follow. */
const TABLE_DEFAULTS = { separator: 'auto', header: true } as const;

/** Row counts as the notice writes them: "Showing 1,000,000 of 1,250,000 rows". */
const ROWS = new Intl.NumberFormat('en-US');


export interface DocumentPaneProps {
  content: DocumentContent;
  client: RenderClient | null;
  scheme: ColorScheme;
  /** Only the shown tab's pane hears the keyboard. */
  active: boolean;
  /** An anchor to scroll to once the document is shown; `onAnchorShown` confirms it. */
  pendingAnchor: { anchor: string; token: number } | null;
  /** A match chosen in find in all tabs, to open the find bar on; a new token opens it again. */
  findRequest?: FindRequest | null | undefined;
  /** `findRequest` was taken. */
  onFindShown?: (() => void) | undefined;
  onAnchorShown: () => void;
  onLink: (href: string, options: { background: boolean }) => void;
  onResolveImage: (src: string) => Promise<ImageResult>;
  onHistory: (direction: 'back' | 'forward') => void;
  /** Where to be once shown (a tab waking up, or back in its history). */
  initialPosition?: ScrollAnchor | null;
  onPosition?: (position: ScrollAnchor) => void;
  onWeight?: (bytes: number) => void;
  /** Content is about to go in (crash recovery's breadcrumb). */
  onRendering?: () => void;
  /** What the tab bar and status bar show about this document. */
  onStatus?: (status: TabStatus) => void;
  onChooseEncoding?: (encoding: ChosenEncoding | null) => void;
  /** Main's menu for the document (right-click, or a state's "File actions…"). */
  onContextMenu?: () => void;
  onClose?: () => void;
  /** The tab's zoom; it scales the document only. */
  zoom?: number;
  /** How the reader last showed this document (a restored tab keeps its view and follow state). */
  initialViewState?: TabViewState;
  /** The reader chose another view, or started or stopped following a log. */
  onViewState?: (state: TabViewState) => void;
  /** Main's word on edit mode for this tab (Ctrl+E, ADR-013); a new token is a new request. */
  editRequest?: EditRequest | null;
  /** Saves the edited text, naming the version it was loaded from. */
  onSave?: (text: string, base: string | null) => Promise<SaveResult>;
  /** The tab in edit mode now has unsaved changes, or no longer has. */
  onDirty?: (dirty: boolean) => void;
  /** The page left edit mode: main takes the grant back. */
  onLeaveEdit?: () => void;
  /** A short message for the status bar. */
  onMessage?: (message: string) => void;
  /** While in edit mode, what close and quit can do with the edits; null once out of it. */
  onEditor?: (editor: Editor | null) => void;
  /** Leaving edit mode with unsaved changes: asks the reader; true once they are saved or discarded. */
  onConfirmLeave?: () => Promise<boolean>;
  /** Hands main the unsaved text, kept in memory for a renderer crash (ADR-013). */
  onKeep?: (text: string, base: string | null) => void;
  /** How a table reads when its tab has no choice of its own: the settings (ADR-021). */
  tableDefaults?: TableDefaults;
  /** Unsaved text main kept from before a crash: the pane opens in edit mode with it. */
  recovered?: Recovered['kept'];
  /** Reads the file again (a save found it changed, or wrote it back after it was gone). */
  onReread?: () => void;
}

/** Unsaved text goes to main once typing pauses this long. */
const KEEP_MS = 1000;

/** Split while editing re-renders once typing pauses this long, and at least this often (ADR-014). */
const PREVIEW_TIMING = { pauseMs: 150, maxMs: 1000 };

/**
 * One document and everything about how it's shown: its view, banners, find and keys. The
 * window gives it a fresh key per navigation, so another document starts from its defaults; a
 * new version of the same file arrives as new `content` and keeps them.
 */
export function DocumentPane({
  content,
  client,
  scheme,
  active,
  pendingAnchor,
  findRequest = null,
  onFindShown,
  onAnchorShown,
  onLink,
  onResolveImage,
  onHistory,
  initialPosition = null,
  onPosition,
  onWeight,
  onRendering,
  onStatus,
  onChooseEncoding,
  onContextMenu,
  onClose,
  zoom = 1,
  initialViewState = {},
  onViewState,
  editRequest = null,
  onSave,
  onDirty,
  onLeaveEdit,
  onMessage,
  onEditor,
  onConfirmLeave,
  onKeep,
  recovered = null,
  onReread,
  tableDefaults = TABLE_DEFAULTS,
}: DocumentPaneProps) {
  const [dirty, setDirty] = useState(false);
  const dirtyNow = useRef(false);
  // Unsaved edits stay in the editor whatever the file on disk turns into: the pane keeps showing
  // the last text read until the edits are saved or discarded (UX F12).
  const [held, setHeld] = useState(false);
  const lastReady = useRef<Extract<DocumentContent, { state: 'ready' }> | null>(null);
  if (content.state === 'ready') lastReady.current = content;
  const ready = content.state === 'ready' ? content : held ? lastReady.current : null;
  // The document's own opening view until the user toggles it.
  const [chosenView, setChosenView] = useState<ViewMode | null>(initialViewState.view ?? null);
  const [renderAnyway, setRenderAnyway] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [follow, setFollow] = useState(initialViewState.follow === true);
  // The source pane's share of a split (ADR-014), kept with the view state once moved.
  const [ratio, setRatio] = useState(initialViewState.ratio ?? 0.5);
  const [narrow, setNarrow] = useState(false);
  // The reader's table options for this tab, kept with its view state (ADR-021).
  const [tableOptions, setTableOptions] = useState<TableOptions>(initialViewState.table ?? {});
  const shape = ready ? formatView(ready.format, tableOptions.asTable === true) : null;
  const views = shape?.views ?? null;
  const format = ready ? workerFormat(ready.format) : null;
  const article = format !== null;
  const reader = shape?.reader === true;
  const json = shape?.tree === true;
  const asTable = shape?.asTable === true;
  const tabular = shape?.table === true;
  const separatorChoice = tableOptions.separator ?? tableDefaults.separator;
  const header = tableOptions.header ?? tableDefaults.header;
  const renderable = shape?.renderable === true;
  const splittable = shape?.splittable === true;
  const wantedView = (chosenView === 'split' && !splittable ? null : chosenView) ?? ready?.view ?? 'rendered';
  // Editing in split, the preview follows the editor's text rather than the file's (ADR-014).
  const [previewText, setPreviewText] = useState<string | null>(null);
  const markdown = ready && article ? (previewText ?? ready.text) : null;
  // Over the render limit, it opens as source: rendering it is the reader's request (UX §4).
  const render = useRenderedHtml(client, markdown, wantedView !== 'source', { readerAsked: ready?.banner === 'too-large', live: previewText !== null, format: format ?? 'markdown' });
  // JSON's tree: indexed by the worker, drawn by the page (ADR-018).
  const jsonTree = useJsonTree(client, json && ready ? ready.text : null, wantedView !== 'source');
  const treeFailed = jsonTree.status === 'invalid' || jsonTree.status === 'too-large' || jsonTree.status === 'failed';
  const treeModel = jsonTree.status === 'ready' || jsonTree.status === 'pending' ? jsonTree.model : null;
  // Invalid JSON opens as source with the cursor where it breaks (UX F14); a new reading moves it there again.
  const invalidAt = jsonTree.status === 'invalid' ? jsonTree : null;
  const sourceCursor = useMemo(
    () => (invalidAt ? { line: invalidAt.line, column: invalidAt.column } : null),
    [invalidAt?.line, invalidAt?.column, ready?.text],
  );
  // CSV/TSV's table: read by the worker on its own budget, drawn by the page (ADR-018, ADR-020); in
  // split while editing it follows the editor's text.
  const csvTable = useCsvTable(client, tabular && ready ? (previewText ?? ready.text) : null, wantedView !== 'source', {
    // Auto keeps a .tsv on tabs; anything else is sniffed (ADR-021).
    separator: separatorChoice !== 'auto' ? separatorChoice : (shape?.separator ?? 'sniff'),
    readerAsked: ready?.banner === 'too-large',
    live: previewText !== null,
  });
  const tableFailed = csvTable.status === 'too-large' || csvTable.status === 'failed';
  const shownTable = csvTable.status === 'ready' || csvTable.status === 'pending' || csvTable.status === 'paused' ? csvTable : null;
  // A document that failed to render shows its source instead.
  const layout = wantedView !== 'source' && (render.status === 'failed' || treeFailed || tableFailed) ? 'source' : wantedView;
  // What Ctrl+\ goes back to from split.
  const lastSingle = useRef<SingleView>('rendered');
  if (layout !== 'split') lastSingle.current = layout;
  const waiting =
    wantedView === 'rendered' &&
    ((render.status === 'pending' && render.html === null) || (jsonTree.status === 'pending' && treeModel === null) || (csvTable.status === 'pending' && csvTable.table === null));
  const loading = useDelayed(waiting, LOADING_DELAY_MS);
  const cancellable = useDelayed(waiting, CANCEL_AFTER_MS);
  const cancelRender = () => {
    render.cancel();
    jsonTree.cancel();
    csvTable.cancel();
  };
  const rendered = useMemo<RenderedContent | null>(() => {
    if (ready && tabular) return shownTable?.table ? { table: shownTable.table, source: shownTable.text, label: fileName(ready.path), header } : null;
    if (ready && reader) return { text: ready.text };
    if (ready && json) return treeModel ? { tree: treeModel, label: fileName(ready.path) } : null;
    return render.html === null ? null : { html: render.html };
  }, [ready, reader, json, treeModel, tabular, shownTable?.table, shownTable?.text, header, render.html]);
  const endFollow = useCallback(() => setFollow(false), []);
  const showRendered = useCallback(() => {
    setRenderAnyway(true);
    setChosenView('rendered');
  }, []);

  const documentHandle = useRef<DocumentHandle>(null);

  // Edit mode (ADR-013). While the text has unsaved changes, the editor keeps it: a new read of
  // the file (it changed on disk) neither replaces it nor becomes the version a save names.
  const [editing, setEditing] = useState(false);
  // A split in a window too narrow for it shows one view; the toggles still act on the split.
  const view = shownView(layout, { narrow, editing });
  const live = editing && view === 'split' && splittable;
  const liveNow = useLatest(live);
  const preview = useMemo(() => pauseOrMax(() => setPreviewText(documentHandle.current?.sourceText() ?? null), PREVIEW_TIMING), []);
  useEffect(() => {
    // Into live: the preview starts from the editor's text as it is; out of it, from the file's.
    if (live) setPreviewText(documentHandle.current?.sourceText() ?? null);
    else {
      preview.cancel();
      setPreviewText(null);
    }
  }, [live, preview]);
  useEffect(() => () => preview.cancel(), [preview]);
  const edits = useRef(0);
  const [pinnedText, setPinnedText] = useState('');
  const base = useRef(ready?.version ?? null);
  const readText = useRef(ready?.text ?? '');
  readText.current = ready?.text ?? '';
  const readVersion = useRef(ready?.version ?? null);
  readVersion.current = ready?.version ?? null;
  // A new read while the edits are unsaved is a change on disk: the bar asks what to do with it.
  const [disk, setDiskShown] = useState<DiskChange | null>(null);
  const diskNow = useRef<DiskChange | null>(null);
  const setDisk = (next: DiskChange | null) => {
    diskNow.current = next;
    setDiskShown(next);
  };
  const assess = (read: DocumentContent) => {
    if (!dirtyNow.current) setDisk(null);
    else if (read.state === 'ready') setDisk(read.version === base.current ? null : 'disk-changed');
    else if (read.state === 'missing') setDisk(base.current === null ? null : 'disk-deleted');
    else setDisk('disk-unreadable');
  };
  useEffect(() => {
    if (content.state === 'ready' && !dirtyNow.current) base.current = content.version;
    if (!dirtyNow.current) setHeld(false);
    assess(content);
  }, [content]);
  const markDirty = (next: boolean) => {
    if (next && !dirtyNow.current) {
      setPinnedText(readText.current);
      setHeld(true);
    }
    if (!next) setDisk(null);
    dirtyNow.current = next;
    setDirty(next);
  };
  const keepListener = useLatest(onKeep);
  const keepTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keepNow = useCallback(() => {
    clearTimeout(keepTimer.current);
    const text = documentHandle.current?.sourceText();
    if (dirtyNow.current && text != null) keepListener.current?.(text, base.current);
  }, []);
  const edited = useCallback(() => {
    edits.current++;
    if (liveNow.current) preview.poke();
    if (!dirtyNow.current) markDirty(true);
    clearTimeout(keepTimer.current);
    keepTimer.current = setTimeout(keepNow, KEEP_MS);
  }, [keepNow]);
  useEffect(() => () => clearTimeout(keepTimer.current), []);
  // Back from a crash with unsaved text: edit mode again, that text, still unsaved, still against
  // the version it was loaded from.
  useEffect(() => {
    if (!recovered || !ready) return;
    base.current = recovered.base;
    setPinnedText(recovered.text);
    dirtyNow.current = true;
    setDirty(true);
    setHeld(true);
    setEditing(true);
    setChosenView((current) => viewForEditing(current ?? 'source'));
    assess(content);
  }, [recovered, ready !== null]);
  const reportedDirty = useRef(false);
  useEffect(() => {
    if (dirty === reportedDirty.current) return;
    reportedDirty.current = dirty;
    onDirty?.(dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!editRequest) return;
    // Main refuses a file it didn't read as text with content (ADR-015); there is no grant to give back.
    if (editRequest.edit === 'refused') return onMessage?.("This file can't be edited");
    if (editRequest.edit === 'granted') {
      if (!ready) {
        onLeaveEdit?.();
        onMessage?.("This file can't be edited");
        return;
      }
      setEditing(true);
      setChosenView(viewForEditing(layout));
    } else if (dirtyNow.current) {
      void onConfirmLeave?.().then((left) => {
        if (!left) return;
        setEditing(false);
        onLeaveEdit?.();
      });
    } else {
      setEditing(false);
      onLeaveEdit?.();
    }
    // Only a new request acts; the callbacks may change on any render.
  }, [editRequest?.token]);
  /** True once the text is on disk and nothing typed meanwhile is left unsaved. */
  const save = async (): Promise<boolean> => {
    const text = documentHandle.current?.sourceText();
    if (!ready || !onSave || text == null) return false;
    if (diskNow.current) {
      onMessage?.(DISK_UNSAVED[diskNow.current]);
      return false;
    }
    const editsAtSave = edits.current;
    const result = await onSave(text, base.current);
    if (result.kind !== 'saved') {
      if (result.kind === 'refused' && result.reason === 'not-editable') setEditing(false);
      onMessage?.(notSaved(result, ready.encoding));
      // A change the watcher hasn't reported yet: reading it brings up the bar.
      if (result.kind === 'conflict') onReread?.();
      return false;
    }
    base.current = result.version;
    onMessage?.('Saved');
    // The pane shows the file as it is now: the saved text, or the file written back after it was gone.
    onReread?.();
    // Typing during the save stays unsaved.
    if (edits.current !== editsAtSave) return false;
    markDirty(false);
    return true;
  };
  /** Drops the edits: the editor shows the file as last read, and a save names that version. */
  const discard = () => {
    documentHandle.current?.replaceSource(readText.current);
    // The file's text replaces the edits without an edit: a live preview shows it now too.
    if (liveNow.current) setPreviewText(readText.current);
    base.current = readVersion.current;
    markDirty(false);
    setHeld(false);
  };
  /** The reader's edits stand against the file as it is now: the next save writes over it (or back). */
  const keepMine = () => {
    base.current = content.state === 'ready' ? content.version : null;
    setDisk(null);
  };
  /** Their file replaces the edits; one that can't be shown as text leaves edit mode. */
  const loadTheirs = () => {
    discard();
    if (content.state === 'ready') return;
    setEditing(false);
    onLeaveEdit?.();
  };
  // Show diff: the reader's text as it was when they asked, against the file on disk.
  const [diff, setDiff] = useState<string | null>(null);
  // After a choice the bar is gone, and with it the button that had focus (or the diff's Show diff
  // button its modal would restore focus to): focus goes back to the editor.
  const [refocus, setRefocus] = useState(0);
  const choose = (choice: () => void) => () => {
    choice();
    setRefocus((n) => n + 1);
  };
  const closeDiff = (choice?: () => void) => {
    if (choice) choose(choice)();
    setDiff(null);
  };
  useEffect(() => {
    if (refocus === 0) return;
    return settleFocus(() => documentHandle.current?.focus());
  }, [refocus]);
  const diskActions: Record<DiskChange, { label: string; onAction: () => void }[]> = {
    'disk-changed': [
      { label: 'Show diff', onAction: () => setDiff(documentHandle.current?.sourceText() ?? pinnedText) },
      { label: 'Keep mine', onAction: choose(keepMine) },
      { label: 'Load theirs', onAction: choose(loadTheirs) },
    ],
    'disk-deleted': [
      { label: 'Keep mine', onAction: choose(keepMine) },
      {
        label: 'Save again',
        onAction: choose(() => {
          keepMine();
          void actions.current.save();
        }),
      },
    ],
    'disk-unreadable': [{ label: 'Load theirs', onAction: choose(loadTheirs) }],
  };
  const actions = useLatest({ save, discard });
  useEffect(() => {
    if (!editing) return;
    onEditor?.({ save: () => actions.current.save(), discard: () => actions.current.discard(), focus: () => documentHandle.current?.focus(), keepNow });
    return () => onEditor?.(null);
  }, [editing, onEditor]);
  const { viewer, expandDiagram, expandImage, closeViewer } = useZoomViewer(active);
  const { find, findSeed, findResult, setFindResult, replaced, openFind, openFindOn, endReplace, runFind, stepFind, replaceMatch, replaceAll, closeFind } = useFind(documentHandle);

  // The outline: open for the window, shown by the active pane only. Markdown's comes with its
  // rendered view; a format with no rendered view (YAML, TOML) has its source's.
  const [outlineOpen, setOutlineOpen] = useOutline();
  const [focusOutline, setFocusOutline] = useState(false);
  const [heading, setHeading] = useState<string | null>(null);
  const [sourceEntries, setSourceEntries] = useState<OutlineEntry[]>([]);
  const sourceOutlined = views?.outline === true && views.rendered === 'none';
  const outlined = views?.outline === true && (sourceOutlined ? view === 'source' : view === 'rendered' || view === 'split');
  const showsOutline = active && outlineOpen && outlined;
  const closeOutline = useCallback(() => {
    setOutlineOpen(false);
    setFocusOutline(false);
    documentHandle.current?.focus();
  }, [setOutlineOpen]);
  const goToHeading = useCallback(
    (id: string) => {
      const line = sourceOutlined ? sourceEntries.find((entry) => entry.id === id)?.line : undefined;
      if (line !== undefined) documentHandle.current?.scrollToLine(line);
      else documentHandle.current?.scrollToAnchor(id);
      setHeading(id);
    },
    [sourceOutlined, sourceEntries],
  );

  // In a text field (the find bar), End and Alt+arrows edit the text; they don't move the document.
  const history = (direction: 'back' | 'forward') => ({ typing }: { typing: boolean }) => {
    if (typing) return false;
    onHistory(direction);
    return true;
  };
  const toggle = (next: ViewToggle) => {
    if ('refused' in next) onMessage?.(next.refused);
    else setChosenView(next.view);
    return true;
  };
  const step = (direction: 1 | -1) => () => {
    if (!find.open) return false;
    stepFind(direction);
    return true;
  };
  // Table options (ADR-021): from the palette, or the status bar's Table options menu, which runs
  // these commands. A new separator reads the table again; the header only redraws it.
  const separatorCommand = (separator: SeparatorChoice) => () => {
    if (!tabular) return false;
    setTableOptions((current) => ({ ...current, separator }));
    return true;
  };
  const tableCommands = {
    tableSeparatorAuto: separatorCommand('auto'),
    tableSeparatorComma: separatorCommand(','),
    tableSeparatorSemicolon: separatorCommand(';'),
    tableSeparatorTab: separatorCommand('\t'),
    tableSeparatorPipe: separatorCommand('|'),
    toggleTableHeader: () => {
      if (!tabular) return false;
      setTableOptions((current) => ({ ...current, header: !header }));
      return true;
    },
    resetTableOptions: () => {
      if (!tabular) return false;
      if (asTable) setChosenView(null);
      setTableOptions({});
      return true;
    },
    showAsTable: () => {
      if (!ready) return false;
      // Its format draws a rendered view of its own instead of a table (ADR-021).
      if (!formatView(ready.format, true).table) {
        onMessage?.(`${FORMAT_NAMES[ready.format]} files have their own view (Ctrl+U)`);
        return true;
      }
      if (!tabular) setTableOptions((current) => ({ ...current, asTable: true }));
      // Edit mode keeps the editor: the table comes beside it.
      setChosenView(editing ? 'split' : 'rendered');
      return true;
    },
  };
  useCommands(
    {
      toggleSource: () => renderable && toggle(afterToggleSource(layout, { editing })),
      toggleSplit: () => ready !== null && toggle(afterToggleSplit(layout, { splittable, editing, lastSingle: lastSingle.current, formatName: FORMAT_NAMES[ready.format] })),
      toggleWrap: () => {
        if (view === 'rendered') return false;
        setWrap((current) => !current);
        return true;
      },
      followEnd: ({ typing }) => {
        if (!views?.follow || typing) return false;
        setFollow(true);
        return true;
      },
      find: () => {
        if (!ready) return false;
        // The tree and the table draw only the rows in view: their text is searched in the source.
        if ((json || tabular) && view === 'rendered') {
          onMessage?.('Find works in the source view (Ctrl+U)');
          return true;
        }
        openFind();
        return true;
      },
      findReplace: () => {
        if (!ready) return false;
        if (!editing) onMessage?.('Find and replace works in edit mode (Ctrl+E)');
        else openFind({ replace: true });
        return true;
      },
      findNext: step(1),
      findPrevious: step(-1),
      back: history('back'),
      forward: history('forward'),
      save: () => {
        if (!editing) return false;
        void save();
        return true;
      },
      expandAll: () => {
        const tree = view === 'rendered' ? documentHandle.current?.tree() : null;
        if (!tree) return false;
        tree.expandAll();
        return true;
      },
      collapseAll: () => {
        const tree = view === 'rendered' ? documentHandle.current?.tree() : null;
        if (!tree) return false;
        tree.collapseAll();
        return true;
      },
      ...tableCommands,
      copyJsonPath: () => {
        const tree = view === 'rendered' ? documentHandle.current?.tree() : null;
        if (!tree || !treeModel) return false;
        const path = treeModel.path(tree.focusedNode());
        void navigator.clipboard.writeText(path).then(
          () => onMessage?.(`Copied ${path}`),
          () => onMessage?.("Couldn't copy the path"),
        );
        return true;
      },
      toggleOutline: () => {
        if (!outlined) return false;
        if (outlineOpen) closeOutline();
        else {
          setOutlineOpen(true);
          setFocusOutline(true);
        }
        return true;
      },
    },
    active,
  );

  useEffect(() => {
    if (!active || !find.open) return;
    // Capture phase, like the commands: Esc closes find wherever the focus is.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeFind();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, find.open, closeFind]);

  // Replace is edit mode's: leaving edit mode closes its row and leaves find open.
  useEffect(() => {
    if (!editing) endReplace();
  }, [editing, endReplace]);

  // Switching views, the rendered HTML arriving, or replace moving find to the source repeats the
  // search in what is now showing.
  useEffect(() => {
    if (find.open && find.query) runFind(find.query, find.caseSensitive, find.line);
    // Only a change of view, content or target repeats the search, not typing (that already ran it).
  }, [view, rendered, find.replace]);

  // A match chosen in find in all tabs (ADR-024): the find bar opens with its query, on it. The tree
  // and the table have no find, so their source shows.
  useEffect(() => {
    if (!findRequest || !ready) return;
    if ((json || tabular) && view === 'rendered') setChosenView('source');
    openFindOn(findRequest);
    onFindShown?.();
  }, [findRequest, ready !== null]);

  // An anchor waits until the rendered view has content to scroll to.
  useEffect(() => {
    if (!pendingAnchor || view === 'source' || !rendered) return;
    documentHandle.current?.scrollToAnchor(pendingAnchor.anchor);
    onAnchorShown();
  }, [pendingAnchor, view, rendered, onAnchorShown]);

  useEffect(() => {
    onViewState?.({
      ...(chosenView ? { view: chosenView } : {}),
      ...(follow ? { follow: true as const } : {}),
      ...(ratio !== 0.5 ? { ratio } : {}),
      ...(Object.keys(tableOptions).length > 0 ? { table: tableOptions } : {}),
    });
  }, [onViewState, chosenView, follow, ratio, tableOptions]);

  // Only the source view shows the file's lines; rendered and reader views wrap to the window.
  const lines = useMemo(() => (ready && view !== 'rendered' ? countLines(ready.text) : null), [ready, view]);
  // An article's prose is counted by the worker as it renders; reader text is all prose.
  const textWords = useMemo(() => (ready && reader ? countWords(ready.text) : null), [ready, reader]);
  const words = article ? render.words : textWords;
  useEffect(() => {
    onStatus?.({
      state: ready ? 'ready' : content.state,
      format: ready?.format ?? null,
      view: ready ? view : null,
      encoding: ready?.encoding ?? null,
      lines,
      words,
      follow,
      editing,
      dirty,
      // The status bar's Table options read these while a table shows (ADR-021).
      table: tabular && view !== 'source' ? { separator: separatorChoice, found: shownTable?.table?.separator ?? null, header } : null,
    });
  }, [onStatus, content.state, ready, view, lines, words, follow, editing, dirty, tabular, separatorChoice, shownTable?.table, header]);

  if (!ready) {
    return (
      <DocumentState
        content={content as Exclude<DocumentContent, { state: 'ready' }>}
        onClose={onClose}
        onFileActions={onContextMenu}
      />
    );
  }

  return (
    <>
      {disk && <DocumentBanner kind={disk} actions={diskActions[disk]} />}
      {ready.banner === 'too-large' && view === 'source' && !renderAnyway && (
        // Render anyway is Markdown's and the reader's; tables have Show as table (ADR-020); past its
        // limits, JSON is source (ADR-018).
        tabular ? (
          <DocumentBanner kind="too-large" actions={[{ label: 'Show as table', onAction: showRendered }]} />
        ) : (
          <DocumentBanner kind="too-large" {...(json ? {} : { onAction: showRendered })} />
        )
      )}
      {csvTable.status === 'too-large' && view === 'source' && <DocumentBanner kind="too-large" />}
      {csvTable.status === 'failed' &&
        (csvTable.reason === 'error' ? (
          <DocumentBanner kind="render-failed" onAction={csvTable.retry} />
        ) : (
          <DocumentBanner kind={csvTable.reason === 'slow' ? 'render-slow' : 'render-cancelled'} actions={[{ label: 'Show as table', onAction: csvTable.showAnyway }]} />
        ))}
      {csvTable.status === 'paused' && <DocumentBanner kind={PAUSED_BANNERS[csvTable.reason]} />}
      {shownTable?.table && shownTable.table.totalRows > shownTable.table.rows && view !== 'source' && (
        <DocumentBanner kind="rows-capped" detail={`Showing ${ROWS.format(shownTable.table.rows - 1)} of ${ROWS.format(shownTable.table.totalRows - 1)} rows`} />
      )}
      {jsonTree.status === 'too-large' && view === 'source' && <DocumentBanner kind="too-large" />}
      {jsonTree.status === 'invalid' && <DocumentBanner kind="json-invalid" detail={`line ${jsonTree.line}, column ${jsonTree.column}`} />}
      {jsonTree.status === 'failed' &&
        (jsonTree.reason === 'slow' ? (
          <DocumentBanner kind="render-slow" />
        ) : jsonTree.reason === 'cancelled' ? (
          <DocumentBanner kind="render-cancelled" actions={[{ label: 'Try again', onAction: jsonTree.retry }]} />
        ) : (
          <DocumentBanner kind="render-failed" onAction={jsonTree.retry} />
        ))}
      {ready.guessedEncoding && (
        <DocumentBanner kind="encoding" detail={ENCODING_NAMES[ready.encoding]}>
          {onChooseEncoding && <EncodingMenu onChoose={onChooseEncoding}>Reopen with encoding…</EncodingMenu>}
        </DocumentBanner>
      )}
      {render.status === 'paused' && <DocumentBanner kind={PAUSED_BANNERS[render.reason]} detail={syntaxDetail(render.syntax)} />}
      {render.status === 'failed' &&
        (render.reason === 'slow' ? (
          <DocumentBanner kind="render-slow" onAction={render.renderAnyway} />
        ) : render.reason === 'cancelled' ? (
          <DocumentBanner kind="render-cancelled" actions={[{ label: 'Render anyway', onAction: render.renderAnyway }]} />
        ) : render.reason === 'syntax' ? (
          <DocumentBanner kind="syntax-error" detail={syntaxDetail(render.syntax)} />
        ) : (
          <DocumentBanner kind="render-failed" onAction={render.retry} />
        ))}
      {loading && <DocumentLoading {...(cancellable ? { onCancel: cancelRender } : {})} />}
      {find.open && (
        <FindBar
          key={findSeed?.token ?? 0}
          initial={findSeed ?? undefined}
          result={findResult}
          focusToken={find.token}
          onQuery={runFind}
          onStep={stepFind}
          onClose={closeFind}
          replace={find.replace ? { onReplace: replaceMatch, onReplaceAll: replaceAll, replaced } : undefined}
        />
      )}
      <div className="document-body">
        <DocumentView
          ref={documentHandle}
          rendered={rendered}
          source={{ text: dirty ? pinnedText : ready.text, language: sourceLanguage(ready.format, ready.path) }}
          editable={editing}
          onEdit={edited}
          replacing={find.open && find.replace}
          pendingFind={findSeed}
          onPendingFind={setFindResult}
          sourceCursor={sourceCursor}
          view={view}
          splitRatio={ratio}
          onSplitRatio={setRatio}
          onNarrow={setNarrow}
          wrap={wrap}
          follow={follow}
          onFollowEnded={endFollow}
          onLink={onLink}
          onContextMenu={onContextMenu}
          onResolveImage={onResolveImage}
          scheme={scheme}
          initialPosition={initialPosition}
          onPosition={onPosition}
          onWeight={onWeight}
          onRendering={onRendering}
          zoom={zoom}
          onHeading={showsOutline ? setHeading : undefined}
          onSourceOutline={showsOutline && sourceOutlined ? setSourceEntries : undefined}
          onExpandDiagram={expandDiagram}
          onExpandImage={expandImage}
        />
        {showsOutline && (
          <OutlinePanel entries={sourceOutlined ? sourceEntries : render.outline} empty={sourceOutlined ? 'No keys' : 'No headings'} current={heading} onChoose={goToHeading} onClose={closeOutline} autoFocus={focusOutline} />
        )}
      </div>
      {viewer && <ZoomViewer content={viewer.content} name={viewer.name} onClose={closeViewer} />}
      {diff !== null && disk === 'disk-changed' && content.state === 'ready' && (
        <DiffDialog
          mine={diff}
          theirs={content.text}
          language={sourceLanguage(content.format, content.path)}
          onKeepMine={() => closeDiff(keepMine)}
          onLoadTheirs={() => closeDiff(loadTheirs)}
          onClose={() => closeDiff()}
        />
      )}
    </>
  );
}
