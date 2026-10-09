import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChosenEncoding, DocumentContent } from '../../shared/contracts';
import type { ImageResult, SaveResult, TextEncoding } from '../../shared/documents';
import type { Editor } from '../edit/editors';
import type { FormatId, ViewMode } from '../../shared/formats';
import type { Platform } from '../../shared/keymap';
import { useCommands } from '../commands/useCommands';
import { OutlinePanel } from '../outline/OutlinePanel';
import { useOutline } from '../outline/useOutline';
import type { ScrollAnchor, TabViewState } from '../../shared/tabs';
import type { TabStatus } from '../tabs/store';
import type { RenderClient } from '../worker/client';
import { DocumentBanner, DocumentLoading, DocumentState, type DiskChange } from './DocumentState';
import { EncodingMenu } from './EncodingMenu';
import { ENCODING_NAMES } from './encodings';
import { DocumentView, type DocumentHandle, type RenderedContent } from './DocumentView';
import { FindBar } from './FindBar';
import type { ColorScheme } from './host';
import type { FindResult, SourceLanguage } from './source-view';
import { useDelayed } from './useDelayed';
import { countWords } from '../../shared/words';
import type { ImageExpand } from './images';
import { ZoomViewer, type ZoomContent } from './ZoomViewer';
import { useRenderedHtml } from './useRenderedHtml';

const SOURCE_LANGUAGES: Record<FormatId, SourceLanguage> = { markdown: 'markdown', log: 'log', text: null, plain: null };

/** A render slower than this shows the loading skeleton (UX: nothing flashes under 150 ms). */
const LOADING_DELAY_MS = 150;

const NO_MATCHES: FindResult = { current: 0, total: 0, capped: false };

export interface DocumentPaneProps {
  content: DocumentContent;
  client: RenderClient | null;
  platform: Platform;
  scheme: ColorScheme;
  /** Only the shown tab's pane hears the keyboard. */
  active: boolean;
  /** An anchor to scroll to once the document is shown; `onAnchorShown` confirms it. */
  pendingAnchor: { anchor: string; token: number } | null;
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
  editRequest?: { edit: 'granted' | 'leave'; token: number } | null;
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
  /** Unsaved text main kept from before a crash: the pane opens in edit mode with it. */
  recovered?: { text: string; base: string | null } | null;
  /** Reads the file again (a save found it changed, or wrote it back after it was gone). */
  onReread?: () => void;
}

/** Unsaved text goes to main once typing pauses this long. */
const KEEP_MS = 1000;

/** Why Ctrl+S doesn't write while the bar waits for the reader's choice. */
const DISK_UNSAVED: Record<DiskChange, string> = {
  'disk-changed': 'Not saved: the file changed on disk. Keep mine or load theirs first',
  'disk-deleted': 'Not saved: the file was deleted. Keep mine or save it again first',
  'disk-unreadable': "Not saved: the file on disk can't be shown as text",
};

/** What the status bar says when a save didn't write. */
function notSaved(result: Exclude<SaveResult, { kind: 'saved' }>, encoding: TextEncoding): string {
  switch (result.kind) {
    case 'conflict':
      return result.version === null ? 'Not saved: the file is gone' : 'Not saved: the file changed on disk';
    case 'unencodable':
      return `Not saved: ${ENCODING_NAMES[encoding]} can't hold “${result.character}” (line ${result.line})`;
    case 'failed':
      return { 'no-permission': 'Not saved: no permission to write this file', 'not-a-file': "Not saved: this isn't a regular file", unavailable: "Not saved: the file couldn't be written" }[result.reason];
    case 'refused':
      return result.reason === 'not-editable' ? "Not saved: this tab isn't in edit mode" : 'Not saved: press Ctrl+S to save';
  }
}

/** How long after the viewer closes its Expand button may take focus back from the modal's restore. */
const RETURN_FOCUS_FRAMES = 10;

function countLines(text: string): number {
  let lines = 1;
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) lines++;
  return lines;
}

/**
 * One document and everything about how it's shown: its view, banners, find and keys. The
 * window gives it a fresh key per navigation, so another document starts from its defaults; a
 * new version of the same file arrives as new `content` and keeps them.
 */
export function DocumentPane({
  content,
  client,
  platform,
  scheme,
  active,
  pendingAnchor,
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
  const wantedView = chosenView ?? ready?.view ?? 'rendered';
  // Markdown renders in the worker; `.txt` shows as reader text; logs and other text are source only.
  const renderable = ready?.format === 'markdown' || ready?.format === 'text';
  const markdown = ready?.format === 'markdown' ? ready.text : null;
  // Over the render limit, it opens as source: rendering it is the reader's request (UX §4).
  const render = useRenderedHtml(client, markdown, wantedView === 'rendered', { readerAsked: ready?.banner === 'too-large' });
  // A document that failed to render shows its source instead.
  const view = wantedView === 'rendered' && render.status === 'failed' ? 'source' : wantedView;
  const loading = useDelayed(wantedView === 'rendered' && render.status === 'pending' && render.html === null, LOADING_DELAY_MS);
  const rendered = useMemo<RenderedContent | null>(() => {
    if (ready?.format === 'text') return { text: ready.text };
    return render.html === null ? null : { html: render.html };
  }, [ready, render.html]);
  const endFollow = useCallback(() => setFollow(false), []);
  const showRendered = useCallback(() => {
    setRenderAnyway(true);
    setChosenView('rendered');
  }, []);

  const documentHandle = useRef<DocumentHandle>(null);

  // Edit mode (ADR-013). While the text has unsaved changes, the editor keeps it: a new read of
  // the file (it changed on disk) neither replaces it nor becomes the version a save names.
  const [editing, setEditing] = useState(false);
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
  const keepListener = useRef(onKeep);
  keepListener.current = onKeep;
  const keepTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const edited = useCallback(() => {
    edits.current++;
    if (!dirtyNow.current) markDirty(true);
    clearTimeout(keepTimer.current);
    keepTimer.current = setTimeout(() => {
      const text = documentHandle.current?.sourceText();
      if (dirtyNow.current && text != null) keepListener.current?.(text, base.current);
    }, KEEP_MS);
  }, []);
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
    setChosenView('source');
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
    if (editRequest.edit === 'granted') {
      if (!ready) {
        onLeaveEdit?.();
        onMessage?.("This file can't be edited");
        return;
      }
      setEditing(true);
      setChosenView('source');
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
    // Written back after it was gone: the pane shows the file as it is now.
    if (content.state !== 'ready') onReread?.();
    // Typing during the save stays unsaved.
    if (edits.current !== editsAtSave) return false;
    markDirty(false);
    return true;
  };
  /** Drops the edits: the editor shows the file as last read, and a save names that version. */
  const discard = () => {
    documentHandle.current?.replaceSource(readText.current);
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
  const diskActions: Record<DiskChange, { label: string; onAction: () => void }[]> = {
    'disk-changed': [
      { label: 'Keep mine', onAction: keepMine },
      { label: 'Load theirs', onAction: loadTheirs },
    ],
    'disk-deleted': [
      { label: 'Keep mine', onAction: keepMine },
      {
        label: 'Save again',
        onAction: () => {
          keepMine();
          void actions.current.save();
        },
      },
    ],
    'disk-unreadable': [{ label: 'Load theirs', onAction: loadTheirs }],
  };
  const actions = useRef({ save, discard });
  actions.current = { save, discard };
  useEffect(() => {
    if (!editing) return;
    onEditor?.({ save: () => actions.current.save(), discard: () => actions.current.discard() });
    return () => onEditor?.(null);
  }, [editing, onEditor]);
  const [viewer, setViewer] = useState<{ content: ZoomContent; name: string; returnFocus: () => void } | null>(null);
  const expandDiagram = useCallback(
    ({ svg, name, panel, returnFocus }: { svg: string; name: string; panel: boolean; returnFocus: () => void }) =>
      setViewer({ content: { kind: 'diagram', svg, panel }, name, returnFocus }),
    [],
  );
  const expandImage = useCallback(
    ({ url, name, returnFocus }: ImageExpand) => setViewer({ content: { kind: 'image', url }, name, returnFocus }),
    [],
  );
  const closeViewer = useCallback(() => setViewer(null), []);
  // The viewer is the shown tab's: switching tabs closes it.
  useEffect(() => {
    if (!active) setViewer(null);
  }, [active]);
  // Back to the diagram's or image's Expand button once the viewer is gone. The modal restores focus
  // itself a frame or more later (after its cleanup and any transition), to the document's shadow
  // host, as it can't see the button inside; so for a few frames, focus left on the body or that
  // host goes to the button. Focus the reader moved anywhere else stays.
  const returnFocus = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (viewer) {
      returnFocus.current = viewer.returnFocus;
      return;
    }
    const back = returnFocus.current;
    returnFocus.current = null;
    if (!back) return;
    let frames = 0;
    let frame = requestAnimationFrame(function settle() {
      const active = document.activeElement;
      if (active === document.body || active?.classList.contains('document-view')) back();
      if (++frames < RETURN_FOCUS_FRAMES) frame = requestAnimationFrame(settle);
    });
    return () => cancelAnimationFrame(frame);
  }, [viewer]);
  const [find, setFind] = useState({ open: false, token: 0, query: '', caseSensitive: false });
  const [findResult, setFindResult] = useState<FindResult>(NO_MATCHES);
  const runFind = useCallback((query: string, caseSensitive: boolean) => {
    setFind((current) => ({ ...current, query, caseSensitive }));
    setFindResult(documentHandle.current?.find(query, { caseSensitive }) ?? NO_MATCHES);
  }, []);
  const stepFind = useCallback((direction: 1 | -1) => {
    if (documentHandle.current) setFindResult(documentHandle.current.step(direction));
  }, []);
  const closeFind = useCallback(() => {
    documentHandle.current?.clear();
    setFind((current) => ({ ...current, open: false, query: '' }));
    // Esc keeps the scroll position at the current match; focus goes back to the document.
    documentHandle.current?.focus();
  }, []);

  // The outline (Markdown, rendered view): open for the window, shown by the active pane only.
  const [outlineOpen, setOutlineOpen] = useOutline();
  const [focusOutline, setFocusOutline] = useState(false);
  const [heading, setHeading] = useState<string | null>(null);
  const outlined = ready?.format === 'markdown' && view === 'rendered';
  const showsOutline = active && outlineOpen && outlined;
  const closeOutline = useCallback(() => {
    setOutlineOpen(false);
    setFocusOutline(false);
    documentHandle.current?.focus();
  }, [setOutlineOpen]);
  const goToHeading = useCallback((id: string) => {
    documentHandle.current?.scrollToAnchor(id);
    setHeading(id);
  }, []);

  // In a text field (the find bar), End and Alt+arrows edit the text; they don't move the document.
  const history = (direction: 'back' | 'forward') => ({ typing }: { typing: boolean }) => {
    if (typing) return false;
    onHistory(direction);
    return true;
  };
  const step = (direction: 1 | -1) => () => {
    if (!find.open) return false;
    stepFind(direction);
    return true;
  };
  useCommands(
    {
      toggleSource: () => {
        if (!renderable) return false;
        if (editing) {
          onMessage?.('Leave edit mode (Ctrl+E) to see the rendered view');
          return true;
        }
        setChosenView(view === 'rendered' ? 'source' : 'rendered');
        return true;
      },
      toggleWrap: () => {
        if (view !== 'source') return false;
        setWrap((current) => !current);
        return true;
      },
      followEnd: ({ typing }) => {
        if (ready?.format !== 'log' || typing) return false;
        setFollow(true);
        return true;
      },
      find: () => {
        if (!ready) return false;
        setFind((current) => ({ ...current, open: true, token: current.token + 1 }));
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

  // Switching views, or the rendered HTML arriving, repeats the search in what is now showing.
  useEffect(() => {
    if (find.open && find.query) runFind(find.query, find.caseSensitive);
    // Only a change of view or content repeats the search, not typing (that already ran it).
  }, [view, rendered]);

  // An anchor waits until the rendered view has content to scroll to.
  useEffect(() => {
    if (!pendingAnchor || view !== 'rendered' || !rendered) return;
    documentHandle.current?.scrollToAnchor(pendingAnchor.anchor);
    onAnchorShown();
  }, [pendingAnchor, view, rendered, onAnchorShown]);

  useEffect(() => {
    onViewState?.({ ...(chosenView ? { view: chosenView } : {}), ...(follow ? { follow: true as const } : {}) });
  }, [onViewState, chosenView, follow]);

  // Only the source view shows the file's lines; rendered and reader views wrap to the window.
  const lines = useMemo(() => (ready && view === 'source' ? countLines(ready.text) : null), [ready, view]);
  // Markdown's prose is counted by the worker as it renders; `.txt` is all prose.
  const textWords = useMemo(() => (ready?.format === 'text' ? countWords(ready.text) : null), [ready]);
  const words = ready?.format === 'markdown' ? render.words : textWords;
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
    });
  }, [onStatus, content.state, ready, view, lines, words, follow, editing, dirty]);

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
        <DocumentBanner kind="too-large" onAction={showRendered} />
      )}
      {ready.guessedEncoding && (
        <DocumentBanner kind="encoding" detail={ENCODING_NAMES[ready.encoding]}>
          {onChooseEncoding && <EncodingMenu onChoose={onChooseEncoding}>Reopen with encoding…</EncodingMenu>}
        </DocumentBanner>
      )}
      {render.status === 'failed' &&
        (render.reason === 'slow' ? (
          <DocumentBanner kind="render-slow" onAction={render.renderAnyway} />
        ) : (
          <DocumentBanner kind="render-failed" onAction={render.retry} />
        ))}
      {loading && <DocumentLoading />}
      {find.open && (
        <FindBar result={findResult} focusToken={find.token} onQuery={runFind} onStep={stepFind} onClose={closeFind} />
      )}
      <div className="document-body">
        <DocumentView
          ref={documentHandle}
          rendered={rendered}
          source={{ text: dirty ? pinnedText : ready.text, language: SOURCE_LANGUAGES[ready.format] }}
          editable={editing}
          onEdit={edited}
          view={view}
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
          onExpandDiagram={expandDiagram}
          onExpandImage={expandImage}
        />
        {showsOutline && (
          <OutlinePanel entries={render.outline} current={heading} onChoose={goToHeading} onClose={closeOutline} autoFocus={focusOutline} />
        )}
      </div>
      {viewer && <ZoomViewer content={viewer.content} name={viewer.name} onClose={closeViewer} />}
    </>
  );
}
