import { useCallback, useEffect, useState } from 'react';
import type { AppInfo, FollowResult, HistoryResult, SandboxChoice } from '../shared/contracts';
import type { RefusalReason } from '../shared/documents';
import type { Platform } from '../shared/keymap';
import { DocumentPane } from './document/DocumentPane';
import type { ColorScheme } from './document/host';
import { useColorScheme } from './document/theme';
import { useDocument } from './document/useDocument';
import { markFirstPaint } from './perf';
import { SandboxUnavailable, UnsandboxedBadge } from './StartupScreens';
import { createRenderClient, type RenderClient } from './worker/client';
import { spawnRenderWorker } from './worker/spawn';

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const scheme = useColorScheme();

  useEffect(() => {
    void window.galeo.app.info().then(setInfo);
  }, []);

  const choose = useCallback((choice: SandboxChoice) => {
    void window.galeo.app.resolveSandboxUnavailable(choice);
  }, []);

  if (!info) return null;
  if (info.sandboxUnavailable) return <SandboxUnavailable cause={info.sandboxUnavailable} onChoose={choose} />;
  return <MainView sandboxed={info.sandboxed} scheme={scheme} platform={info.platform as Platform} />;
}

const REFUSALS: Record<RefusalReason, string> = {
  'not-in-document': "This link can't be opened",
  scheme: 'Only web and email links open outside galeo',
  host: "Links to another host by '//' can't be opened",
  malformed: 'This link is malformed',
  'rate-limited': 'Links open at most once a second',
  blocked: 'Links from this document are blocked',
  unavailable: "This document's links can't be checked right now",
};

/** Status-bar messages go away on their own. */
const MESSAGE_MS = 4000;

function MainView({ sandboxed, scheme, platform }: { sandboxed: boolean; scheme: ColorScheme; platform: Platform }) {
  const [workerReady, setWorkerReady] = useState(false);
  const [client, setClient] = useState<RenderClient | null>(null);
  const { document, reload } = useDocument();
  // Where to scroll once the document main navigated to is shown.
  const [pendingAnchor, setPendingAnchor] = useState<{ anchor: string; token: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(markFirstPaint, []);

  useEffect(() => {
    const worker = spawnRenderWorker();
    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (event.data === 'ready') setWorkerReady(true);
    });
    worker.postMessage('ping');
    setClient(createRenderClient(worker));
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  const moved = useCallback(
    (result: FollowResult | HistoryResult) => {
      if (result.kind === 'navigated') {
        reload();
        if (result.anchor) setPendingAnchor({ anchor: result.anchor, token: Date.now() });
      } else if (result.kind === 'anchor') {
        setPendingAnchor({ anchor: result.anchor, token: Date.now() });
      } else if (result.kind === 'refused') {
        setMessage(REFUSALS[result.reason]);
      }
    },
    [reload],
  );

  const followLink = useCallback(
    (href: string) => {
      // Background tabs arrive with the tab bar; until then a link opens in place.
      if (document) void window.galeo.documents.followLink(document.id, href).then(moved);
    },
    [document, moved],
  );

  const history = useCallback(
    (direction: 'back' | 'forward') => {
      if (document) void window.galeo.documents[direction](document.id).then(moved);
    },
    [document, moved],
  );

  return (
    <>
      <main data-testid="app-root" data-worker={workerReady ? 'ready' : 'starting'}>
        {document && (
          <DocumentPane
            key={`${document.id}:${document.generation}`}
            content={document.content}
            client={client}
            platform={platform}
            scheme={scheme}
            pendingAnchor={pendingAnchor}
            onAnchorShown={() => setPendingAnchor(null)}
            onLink={followLink}
            onHistory={history}
          />
        )}
      </main>
      <footer className="status-bar">
        <span data-testid="status-message" role="status">
          {message ?? ''}
        </span>
        {!sandboxed && <UnsandboxedBadge />}
      </footer>
    </>
  );
}
