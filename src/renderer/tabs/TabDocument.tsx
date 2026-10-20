import type { SeparatorChoice } from '../../shared/csv';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChosenEncoding, FollowResult, HistoryResult } from '../../shared/contracts';
import type { ImageResult, RefusalReason, SaveResult } from '../../shared/documents';
import type { Platform } from '../../shared/keymap';
import type { ScrollAnchor, TabViewState } from '../../shared/tabs';
import { DocumentPane } from '../document/DocumentPane';
import type { ColorScheme } from '../document/host';
import { useDocument } from '../document/useDocument';
import { editors, type Editor } from '../edit/editors';
import { useConfirmUnsaved } from '../edit/UnsavedPrompt';
import type { RenderClient } from '../worker/client';
import { unlessClosed } from './closed-tab';
import type { TabStatus, TabStore } from './store';

const REFUSALS: Record<RefusalReason, string> = {
  'not-in-document': "This link can't be opened",
  'no-input': "This link can't be opened",
  scheme: 'Only web and email links open outside galeo',
  host: "Links to another host by '//' can't be opened",
  malformed: 'This link is malformed',
  'rate-limited': 'Links open at most once a second',
  blocked: 'Links from this document are blocked',
  unavailable: "This document's links can't be checked right now",
  'open-failed': 'No app could open this link',
};

export interface TabDocumentProps {
  id: string;
  active: boolean;
  /** False while hibernated: nothing is read or kept (ADR-002). */
  rendered: boolean;
  /** The tab crashed the window: it isn't read or rendered until the reader asks (ADR-002). */
  crashed: boolean;
  path: string;
  /** Main's count of changes to the file; a new one reads it again. */
  staleReads: number;
  zoom: number;
  store: TabStore;
  client: RenderClient | null;
  platform: Platform;
  scheme: ColorScheme;
  onMessage: (message: string) => void;
  /** How tables read without a choice of their own: the settings (ADR-021). */
  tableDefaults: { separator: SeparatorChoice; header: boolean };
}

/** One tab's content. A hibernated tab has none; it's read and rendered again when shown. */
export function TabDocument(props: TabDocumentProps) {
  if (!props.rendered) return null;
  if (props.crashed) return <CrashedTab id={props.id} path={props.path} store={props.store} onMessage={props.onMessage} />;
  return <LiveTab {...props} />;
}

/** A tab that was rendering when the window's renderer crashed (UX §4 "Crashed"). */
function CrashedTab({ id, path, store, onMessage }: { id: string; path: string; store: TabStore; onMessage: (message: string) => void }) {
  const renderAgain = (view?: 'source') => void store.renderAgain(id, view).catch(unlessClosed(onMessage, "The document couldn't be drawn again"));
  return (
    <section className="document-state" data-testid="document-state" data-state="crashed" role="status">
      <p className="document-state-title">This document crashed the viewer and won't be rendered automatically</p>
      <p className="document-state-path">{path}</p>
      <div className="document-state-actions">
        <button type="button" onClick={() => renderAgain()}>
          Try again
        </button>
        <button type="button" onClick={() => renderAgain('source')}>
          Open as source
        </button>
      </div>
    </section>
  );
}

/** Where the next read lands after a navigation: a history entry's place, or null for the top. */
interface Arrival {
  navigation: number;
  position: ScrollAnchor | null;
}

function LiveTab({ id, active, path, staleReads, zoom, store, client, platform, scheme, onMessage, tableDefaults }: TabDocumentProps) {
  // A tab not shown has no layout to keep its place in: it takes a changed file when shown again.
  const [appliedReads, setAppliedReads] = useState(staleReads);
  useEffect(() => {
    if (active) setAppliedReads(staleReads);
  }, [active, staleReads]);
  const { document, navigated } = useDocument(id, appliedReads, onMessage);
  const [arrival, setArrival] = useState<Arrival | null>(null);
  // An anchor within the current read (a link or a history step inside the document).
  const [pendingAnchor, setPendingAnchor] = useState<{ anchor: string; token: number; navigation: number } | null>(
    null,
  );

  // A new read of the same navigation is the file changed on disk: the tab says so briefly.
  const lastRead = useRef<{ navigation: number; generation: number } | null>(null);
  useEffect(() => {
    if (!document) return;
    const last = lastRead.current;
    if (last && last.navigation === document.navigation && last.generation !== document.generation) store.reloaded(id);
    lastRead.current = { navigation: document.navigation, generation: document.generation };
  }, [document, id, store]);

  const navigation = document?.navigation ?? 0;
  const moved = useCallback(
    (result: FollowResult | HistoryResult) => {
      if (result.kind === 'navigated') {
        navigated();
        const position = 'position' in result ? result.position : null;
        setArrival({ navigation: navigation + 1, position });
        setPendingAnchor(result.anchor && !position ? { anchor: result.anchor, token: Date.now(), navigation: navigation + 1 } : null);
      } else if (result.kind === 'anchor') {
        setPendingAnchor({ anchor: result.anchor, token: Date.now(), navigation });
      } else if (result.kind === 'refused') {
        onMessage(REFUSALS[result.reason]);
      }
    },
    [navigated, navigation, onMessage],
  );

  const followLink = useCallback(
    (href: string, { background }: { background: boolean }) => {
      void window.galeo.documents
        .followLink(id, href, background ? 'background' : 'current')
        .then(moved, unlessClosed(onMessage, "The link couldn't be followed"));
    },
    [id, moved, onMessage],
  );

  const resolveImage = useCallback(
    (src: string): Promise<ImageResult> => window.galeo.documents.resolveImage(id, src),
    [id],
  );

  const history = useCallback(
    (direction: 'back' | 'forward') => {
      void window.galeo.documents[direction](id).then(moved, unlessClosed(onMessage, `Couldn't go ${direction}`));
    },
    [id, moved, onMessage],
  );

  // Main's Ctrl+E for this tab (ADR-013): each one is a new request for the pane.
  const [editRequest, setEditRequest] = useState<{ edit: 'granted' | 'leave' | 'refused'; token: number } | null>(null);
  useEffect(
    () =>
      window.galeo.documents.onEditMode(({ id: tab, edit }) => {
        if (tab === id) setEditRequest((last) => ({ edit, token: (last?.token ?? 0) + 1 }));
      }),
    [id],
  );
  // A request that fails on the way (the tab closed meanwhile) reads as a write that didn't happen.
  const save = useCallback(
    (text: string, base: string | null): Promise<SaveResult> =>
      window.galeo.documents.save(id, text, base).catch((): SaveResult => ({ kind: 'failed', reason: 'unavailable' })),
    [id],
  );
  const dirty = useCallback(
    (isDirty: boolean) =>
      void window.galeo.documents.dirty(id, isDirty).catch(unlessClosed(onMessage, "Couldn't track the unsaved changes: save them to be safe")),
    [id, onMessage],
  );
  const leaveEdit = useCallback(() => void window.galeo.documents.leaveEdit(id).catch(unlessClosed(onMessage, "Couldn't leave edit mode")), [id, onMessage]);
  const onEditor = useCallback((editor: Editor | null) => (editor ? editors.set(id, editor) : editors.delete(id)), [id]);
  const keep = useCallback(
    (text: string, base: string | null) =>
      void window.galeo.documents.keep(id, text, base).catch(unlessClosed(onMessage, "Couldn't keep the unsaved text for recovery: save it to be safe")),
    [id, onMessage],
  );
  // What main holds for the tab, for its first document only: unsaved text from before a renderer
  // crash, or edit mode and unsaved text it had in the window it moved from (ADR-019).
  const [recovered, setRecovered] = useState<{ text: string; base: string | null } | null>(null);
  useEffect(() => {
    let current = true;
    void window.galeo.documents
      .recover(id)
      .then(({ edit, kept }) => {
        if (!current) return;
        if (kept) setRecovered(kept);
        // In edit mode with nothing unsaved: as if main had just granted it.
        else if (edit) setEditRequest((last) => ({ edit: 'granted', token: (last?.token ?? 0) + 1 }));
      })
      .catch(unlessClosed(onMessage, "Couldn't restore this tab's unsaved text"));
    return () => {
      current = false;
    };
  }, [id, onMessage]);
  const confirm = useConfirmUnsaved();
  const confirmLeave = useCallback(() => confirm(id, path.split('/').pop() ?? 'this file'), [confirm, id, path]);

  const onPosition = useCallback((position: ScrollAnchor) => store.moved(id, position), [id, store]);
  const onWeight = useCallback((bytes: number) => void window.galeo.tabs.rendered(id, bytes), [id]);
  const onRendering = useCallback(() => void window.galeo.tabs.rendering(id), [id]);
  const onStatus = useCallback((status: TabStatus) => store.setStatus(id, status), [id, store]);
  const onViewState = useCallback((state: TabViewState) => store.setViewState(id, state), [id, store]);
  const contextMenu = useCallback(() => void window.galeo.documents.contextMenu(id).catch(unlessClosed(onMessage, "The menu couldn't open")), [id, onMessage]);
  const close = useCallback(() => store.close(id), [id, store]);
  const reread = useCallback(() => store.reread(id), [id, store]);
  const chooseEncoding = useCallback(
    (encoding: ChosenEncoding | null) =>
      void window.galeo.documents.setEncoding(id, encoding).then(() => store.reread(id), unlessClosed(onMessage, "The encoding didn't change")),
    [id, store, onMessage],
  );

  if (!document) return null;
  // A navigation lands where its entry says (or at the top); a wake stays put. A re-read of a
  // changed file updates the pane in place, keeping its view, find and place (UX F7).
  const initialPosition = arrival?.navigation === document.navigation ? arrival.position : store.positionOf(id);
  return (
    <DocumentPane
      key={`${id}:${document.navigation}`}
      content={document.content}
      client={client}
      platform={platform}
      scheme={scheme}
      active={active}
      pendingAnchor={pendingAnchor?.navigation === document.navigation ? pendingAnchor : null}
      onAnchorShown={() => setPendingAnchor(null)}
      onLink={followLink}
      onResolveImage={resolveImage}
      onHistory={history}
      initialPosition={initialPosition}
      onPosition={onPosition}
      onWeight={onWeight}
      onRendering={onRendering}
      onStatus={onStatus}
      onChooseEncoding={chooseEncoding}
      onContextMenu={contextMenu}
      onClose={close}
      zoom={zoom}
      initialViewState={store.viewStateOf(id)}
      tableDefaults={tableDefaults}
      onViewState={onViewState}
      editRequest={editRequest}
      onSave={save}
      onDirty={dirty}
      onLeaveEdit={leaveEdit}
      onMessage={onMessage}
      onEditor={onEditor}
      onConfirmLeave={confirmLeave}
      onKeep={keep}
      recovered={document.navigation === 0 ? recovered : null}
      onReread={reread}
    />
  );
}
