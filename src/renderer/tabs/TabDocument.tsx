import { useCallback, useState } from 'react';
import type { ChosenEncoding, FollowResult, HistoryResult } from '../../shared/contracts';
import type { ImageResult, RefusalReason } from '../../shared/documents';
import type { Platform } from '../../shared/keymap';
import type { ScrollAnchor } from '../../shared/tabs';
import { DocumentPane } from '../document/DocumentPane';
import type { ColorScheme } from '../document/host';
import { useDocument } from '../document/useDocument';
import type { RenderClient } from '../worker/client';
import { ignoreClosedTab } from './closed-tab';
import type { TabStatus, TabStore } from './store';

const REFUSALS: Record<RefusalReason, string> = {
  'not-in-document': "This link can't be opened",
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
  /** Main's count of changes to the file; a new one reads it again. */
  staleReads: number;
  zoom: number;
  store: TabStore;
  client: RenderClient | null;
  platform: Platform;
  scheme: ColorScheme;
  onMessage: (message: string) => void;
}

/** One tab's content. A hibernated tab has none; it's read and rendered again when shown. */
export function TabDocument(props: TabDocumentProps) {
  return props.rendered ? <LiveTab {...props} /> : null;
}

/** Where the next read lands after a navigation: a history entry's place, or null for the top. */
interface Arrival {
  generation: number;
  position: ScrollAnchor | null;
}

function LiveTab({ id, active, staleReads, zoom, store, client, platform, scheme, onMessage }: TabDocumentProps) {
  const { document, reload } = useDocument(id, staleReads);
  const [arrival, setArrival] = useState<Arrival | null>(null);
  // An anchor within the current read (a link or a history step inside the document).
  const [pendingAnchor, setPendingAnchor] = useState<{ anchor: string; token: number; generation: number } | null>(
    null,
  );

  const generation = document?.generation ?? 0;
  const moved = useCallback(
    (result: FollowResult | HistoryResult) => {
      if (result.kind === 'navigated') {
        reload();
        const position = 'position' in result ? result.position : null;
        setArrival({ generation: generation + 1, position });
        setPendingAnchor(result.anchor && !position ? { anchor: result.anchor, token: Date.now(), generation: generation + 1 } : null);
      } else if (result.kind === 'anchor') {
        setPendingAnchor({ anchor: result.anchor, token: Date.now(), generation });
      } else if (result.kind === 'refused') {
        onMessage(REFUSALS[result.reason]);
      }
    },
    [reload, generation, onMessage],
  );

  const followLink = useCallback(
    (href: string, { background }: { background: boolean }) => {
      void window.galeo.documents.followLink(id, href, background ? 'background' : 'current').then(moved, ignoreClosedTab);
    },
    [id, moved],
  );

  const resolveImage = useCallback(
    (src: string): Promise<ImageResult> => window.galeo.documents.resolveImage(id, src),
    [id],
  );

  const history = useCallback(
    (direction: 'back' | 'forward') => {
      void window.galeo.documents[direction](id).then(moved, ignoreClosedTab);
    },
    [id, moved],
  );

  const onPosition = useCallback((position: ScrollAnchor) => store.moved(id, position), [id, store]);
  const onWeight = useCallback((bytes: number) => void window.galeo.tabs.rendered(id, bytes), [id]);
  const onStatus = useCallback((status: TabStatus) => store.setStatus(id, status), [id, store]);
  const contextMenu = useCallback(() => void window.galeo.documents.contextMenu(id).catch(ignoreClosedTab), [id]);
  const close = useCallback(() => store.close(id), [id, store]);
  const chooseEncoding = useCallback(
    (encoding: ChosenEncoding | null) =>
      void window.galeo.documents.setEncoding(id, encoding).then(() => store.reread(id), ignoreClosedTab),
    [id, store],
  );

  if (!document) return null;
  // A navigation lands where its entry says (or at the top); a wake or a re-read stays put.
  const initialPosition = arrival?.generation === document.generation ? arrival.position : store.positionOf(id);
  return (
    <DocumentPane
      key={`${id}:${document.generation}`}
      content={document.content}
      client={client}
      platform={platform}
      scheme={scheme}
      active={active}
      pendingAnchor={pendingAnchor?.generation === document.generation ? pendingAnchor : null}
      onAnchorShown={() => setPendingAnchor(null)}
      onLink={followLink}
      onResolveImage={resolveImage}
      onHistory={history}
      initialPosition={initialPosition}
      onPosition={onPosition}
      onWeight={onWeight}
      onStatus={onStatus}
      onChooseEncoding={chooseEncoding}
      onContextMenu={contextMenu}
      onClose={close}
      zoom={zoom}
    />
  );
}
