import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppInfo, SandboxChoice } from '../shared/contracts';
import type { TextEncoding } from '../shared/documents';
import type { FormatId, ViewMode } from '../shared/formats';
import { commandFor, type Platform } from '../shared/keymap';
import { DocumentBanner, DocumentLoading, DocumentState } from './document/DocumentState';
import { DocumentView, type RenderedContent } from './document/DocumentView';
import type { ColorScheme } from './document/host';
import type { SourceLanguage } from './document/source-view';
import { useColorScheme } from './document/theme';
import { useFirstDocument } from './document/useFirstDocument';
import { useDelayed } from './document/useDelayed';
import { useRenderedHtml } from './document/useRenderedHtml';
import { markFirstPaint } from './perf';
import { SandboxUnavailable, UnsandboxedBadge } from './StartupScreens';
import { createRenderClient, type RenderClient } from './worker/client';
import { spawnRenderWorker } from './worker/spawn';

const SOURCE_LANGUAGES: Record<FormatId, SourceLanguage> = { markdown: 'markdown', log: 'log', text: null, plain: null };

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

const ENCODING_NAMES: Record<TextEncoding, string> = {
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16LE',
  'utf-16be': 'UTF-16BE',
  'utf-32le': 'UTF-32LE',
  'utf-32be': 'UTF-32BE',
  'windows-1252': 'Windows-1252',
};

/** A render slower than this shows the loading skeleton (UX: nothing flashes under 150 ms). */
const LOADING_DELAY_MS = 150;

function MainView({ sandboxed, scheme, platform }: { sandboxed: boolean; scheme: ColorScheme; platform: Platform }) {
  const [workerReady, setWorkerReady] = useState(false);
  const [client, setClient] = useState<RenderClient | null>(null);
  const content = useFirstDocument();
  const ready = content?.state === 'ready' ? content : null;
  // The document's own opening view until the user toggles it.
  const [chosenView, setChosenView] = useState<ViewMode | null>(null);
  const [renderAnyway, setRenderAnyway] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [follow, setFollow] = useState(false);
  const wantedView = chosenView ?? ready?.view ?? 'rendered';
  // Markdown renders in the worker; `.txt` shows as reader text; logs and other text are source only.
  const renderable = ready?.format === 'markdown' || ready?.format === 'text';
  const markdown = ready?.format === 'markdown' ? ready.text : null;
  const render = useRenderedHtml(client, markdown, wantedView === 'rendered');
  // A document that failed to render shows its source instead.
  const view = wantedView === 'rendered' && render.status === 'failed' ? 'source' : wantedView;
  const loading = useDelayed(wantedView === 'rendered' && render.status === 'pending', LOADING_DELAY_MS);
  const rendered = useMemo<RenderedContent | null>(() => {
    if (ready?.format === 'text') return { text: ready.text };
    return render.html === null ? null : { html: render.html };
  }, [ready, render.html]);
  const endFollow = useCallback(() => setFollow(false), []);
  const showRendered = useCallback(() => {
    setRenderAnyway(true);
    setChosenView('rendered');
  }, []);

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
    // Capture phase, so the source view's editor never sees these keys first.
    const onKey = (event: KeyboardEvent) => {
      const command = commandFor(event, platform);
      if (command === 'toggleSource' && renderable) {
        event.preventDefault();
        setChosenView(view === 'rendered' ? 'source' : 'rendered');
      } else if (command === 'toggleWrap' && view === 'source') {
        event.preventDefault();
        setWrap((current) => !current);
      } else if (command === 'followEnd' && ready?.format === 'log') {
        event.preventDefault();
        setFollow(true);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [platform, renderable, view, ready]);

  return (
    <>
      <main data-testid="app-root" data-worker={workerReady ? 'ready' : 'starting'}>
        {ready?.banner === 'too-large' && view === 'source' && !renderAnyway && (
          <DocumentBanner kind="too-large" onAction={showRendered} />
        )}
        {ready?.guessedEncoding && <DocumentBanner kind="encoding" detail={ENCODING_NAMES[ready.encoding]} />}
        {render.status === 'failed' && <DocumentBanner kind="render-failed" onAction={render.retry} />}
        {loading && <DocumentLoading />}
        {ready && (
          <DocumentView
            rendered={rendered}
            source={{ text: ready.text, language: SOURCE_LANGUAGES[ready.format] }}
            view={view}
            wrap={wrap}
            follow={follow}
            onFollowEnded={endFollow}
            scheme={scheme}
          />
        )}
        {content && content.state !== 'ready' && <DocumentState content={content} />}
      </main>
      <footer className="status-bar">{!sandboxed && <UnsandboxedBadge />}</footer>
    </>
  );
}
