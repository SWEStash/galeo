import { useCallback, useState } from 'react';
import type { FollowResult, HistoryResult } from '../../shared/contracts';
import type { ImageResult, RefusalReason } from '../../shared/documents';
import type { Platform } from '../../shared/keymap';
import { DocumentPane } from '../document/DocumentPane';
import type { ColorScheme } from '../document/host';
import { useDocument } from '../document/useDocument';
import type { RenderClient } from '../worker/client';

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
  client: RenderClient | null;
  platform: Platform;
  scheme: ColorScheme;
  onMessage: (message: string) => void;
}

/**
 * One tab: its document, its links and history. Tabs that aren't shown stay mounted but hidden and
 * inert, so switching back to one shows it as it was.
 */
export function TabDocument({ id, active, client, platform, scheme, onMessage }: TabDocumentProps) {
  const { document, reload } = useDocument(id);
  // Where to scroll, and in which read of the document: after a navigation, the next one.
  const [pendingAnchor, setPendingAnchor] = useState<{ anchor: string; token: number; generation: number } | null>(
    null,
  );

  const generation = document?.generation ?? 0;
  const moved = useCallback(
    (result: FollowResult | HistoryResult) => {
      if (result.kind === 'navigated') {
        reload();
        setPendingAnchor(result.anchor ? { anchor: result.anchor, token: Date.now(), generation: generation + 1 } : null);
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
      void window.galeo.documents.followLink(id, href, background ? 'background' : 'current').then(moved);
    },
    [id, moved],
  );

  const resolveImage = useCallback(
    (src: string): Promise<ImageResult> => window.galeo.documents.resolveImage(id, src),
    [id],
  );

  const history = useCallback(
    (direction: 'back' | 'forward') => {
      void window.galeo.documents[direction](id).then(moved);
    },
    [id, moved],
  );

  return (
    <section className="tab-panel" data-testid="tab-panel" data-active={active} inert={!active} aria-hidden={!active}>
      {document && (
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
        />
      )}
    </section>
  );
}
