import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChosenEncoding, DocumentContent } from '../../shared/contracts';
import type { ImageResult } from '../../shared/documents';
import type { FormatId, ViewMode } from '../../shared/formats';
import type { Platform } from '../../shared/keymap';
import { useCommands } from '../commands/useCommands';
import type { ScrollAnchor, TabViewState } from '../../shared/tabs';
import type { TabStatus } from '../tabs/store';
import type { RenderClient } from '../worker/client';
import { DocumentBanner, DocumentLoading, DocumentState } from './DocumentState';
import { EncodingMenu } from './EncodingMenu';
import { ENCODING_NAMES } from './encodings';
import { DocumentView, type DocumentHandle, type RenderedContent } from './DocumentView';
import { FindBar } from './FindBar';
import type { ColorScheme } from './host';
import type { FindResult, SourceLanguage } from './source-view';
import { useDelayed } from './useDelayed';
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
}

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
  onStatus,
  onChooseEncoding,
  onContextMenu,
  onClose,
  zoom = 1,
  initialViewState = {},
  onViewState,
}: DocumentPaneProps) {
  const ready = content.state === 'ready' ? content : null;
  // The document's own opening view until the user toggles it.
  const [chosenView, setChosenView] = useState<ViewMode | null>(initialViewState.view ?? null);
  const [renderAnyway, setRenderAnyway] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [follow, setFollow] = useState(initialViewState.follow === true);
  const wantedView = chosenView ?? ready?.view ?? 'rendered';
  // Markdown renders in the worker; `.txt` shows as reader text; logs and other text are source only.
  const renderable = ready?.format === 'markdown' || ready?.format === 'text';
  const markdown = ready?.format === 'markdown' ? ready.text : null;
  const render = useRenderedHtml(client, markdown, wantedView === 'rendered');
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

  const lines = useMemo(() => (ready ? countLines(ready.text) : null), [ready]);
  useEffect(() => {
    onStatus?.({
      state: content.state,
      format: ready?.format ?? null,
      view: ready ? view : null,
      encoding: ready?.encoding ?? null,
      lines,
      follow,
    });
  }, [onStatus, content.state, ready, view, lines, follow]);

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
      {ready.banner === 'too-large' && view === 'source' && !renderAnyway && (
        <DocumentBanner kind="too-large" onAction={showRendered} />
      )}
      {ready.guessedEncoding && (
        <DocumentBanner kind="encoding" detail={ENCODING_NAMES[ready.encoding]}>
          {onChooseEncoding && <EncodingMenu onChoose={onChooseEncoding}>Reopen with encoding…</EncodingMenu>}
        </DocumentBanner>
      )}
      {render.status === 'failed' && <DocumentBanner kind="render-failed" onAction={render.retry} />}
      {loading && <DocumentLoading />}
      {find.open && (
        <FindBar result={findResult} focusToken={find.token} onQuery={runFind} onStep={stepFind} onClose={closeFind} />
      )}
      <DocumentView
        ref={documentHandle}
        rendered={rendered}
        source={{ text: ready.text, language: SOURCE_LANGUAGES[ready.format] }}
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
        zoom={zoom}
      />
    </>
  );
}
