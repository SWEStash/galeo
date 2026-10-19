import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppInfo, GaleoApi, DocumentContent, DocumentRecord, ProfilesState, SettingsState, TabSnapshot } from '../shared/contracts';
import type { Settings } from '../shared/settings';
import type { FormatId } from '../shared/formats';

const DEFAULT_SETTINGS: Settings = {
  themeMode: 'system',
  proseFont: 'Inter',
  codeFont: 'JetBrains Mono',
  fontSize: 17,
  measure: 72,
  statusBar: true,
  quickOpenExclude: [],
  warmTabs: 3,
  warmMegabytes: 20,
  tableSeparator: 'auto',
  tableHeader: true,
};

const SOURCES = Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((key) => [key, 'default'])) as SettingsState['sources'];

const renderRequests: string[] = [];
const renderFormats: string[] = [];
/** How the fake worker answers render requests. */
let workerMode: 'answer' | 'hang' | 'fail' | 'syntax' | 'links' = 'answer';

class FakeWorker extends EventTarget {
  postMessage(message: unknown) {
    const reply = (data: unknown) => queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data })));
    if (message === 'ping') reply('ready');
    const request = message as { type?: string; id: number; text: string; format: string };
    if (request.type === 'render') {
      renderRequests.push(request.text);
      renderFormats.push(request.format);
      if (workerMode === 'hang') return;
      if (workerMode === 'fail') return reply({ type: 'failed', id: request.id, message: 'boom' });
      if (workerMode === 'syntax') return reply({ type: 'failed', id: request.id, message: 'Unexpected character `3`', line: 3 });
      // In `links` mode, `[label](href)` becomes a link, as the real pipeline would render it.
      const html =
        workerMode === 'links'
          ? `<p>${request.text.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '<a href="$2">$1</a>')}</p><h2 id="user-content-goals">Goals</h2>`
          : `<p>${request.text}</p>`;
      const result = { html, outline: [], links: [], images: [], words: 0, ms: 1, cached: false };
      reply({ type: 'rendered', id: request.id, result });
    }
  }
  terminate() {}
}

vi.mock('./worker/spawn', () => ({ spawnRenderWorker: () => new FakeWorker() }));

const baseInfo: AppInfo = {
  name: 'galeo',
  version: '0.0.0',
  platform: 'linux',
  sandboxed: true,
  sandboxUnavailable: null,
  appImage: false,
  crashLoop: false,
};

/** Pushes an event to the page, as main would. */
const events: {
  tabs?: (snapshot: TabSnapshot) => void;
  demote?: (ids: string[]) => void;
  stale?: (id: string) => void;
  dragging?: (on: boolean) => void;
  editMode?: (request: { id: string; edit: 'granted' | 'leave' | 'refused' }) => void;
  confirmClose?: (ids: string[]) => void;
  settings?: (state: SettingsState) => void;
  profiles?: (state: ProfilesState) => void;
} = {};

function stubBridge(info: Partial<AppInfo> = {}, documents: { records?: DocumentRecord[]; content?: DocumentContent } = {}) {
  const api = {
    app: {
      info: vi.fn().mockResolvedValue({ ...baseInfo, ...info }),
      resolveSandboxUnavailable: vi.fn().mockResolvedValue(undefined),
      installLauncher: vi.fn().mockResolvedValue({ ok: false, reason: 'not an AppImage' }),
    },
    documents: {
      read: vi.fn().mockResolvedValue(documents.content),
      setEncoding: vi.fn().mockResolvedValue(undefined),
      followLink: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'not-in-document' }),
      back: vi.fn().mockResolvedValue({ kind: 'none' }),
      forward: vi.fn().mockResolvedValue({ kind: 'none' }),
      resolveImage: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'not-in-document' }),
      pathMenu: vi.fn().mockResolvedValue(undefined),
      contextMenu: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'not-editable' }),
      dirty: vi.fn().mockResolvedValue(undefined),
      leaveEdit: vi.fn().mockResolvedValue(undefined),
      closeAnswer: vi.fn().mockResolvedValue(undefined),
      keep: vi.fn().mockResolvedValue(undefined),
      recover: vi.fn().mockResolvedValue({ edit: false, kept: null }),
      onConfirmClose: vi.fn((listener: (ids: string[]) => void) => {
        events.confirmClose = listener;
        return () => {};
      }),
      onEditMode: vi.fn((listener: (request: { id: string; edit: 'granted' | 'leave' | 'refused' }) => void) => {
        events.editMode = listener;
        return () => {};
      }),
    },
    tabs: {
      dragStart: vi.fn().mockResolvedValue(true),
      dragEnd: vi.fn().mockResolvedValue(undefined),
      adopt: vi.fn().mockResolvedValue(true),
      moveTo: vi.fn().mockResolvedValue(true),
      windows: vi.fn().mockResolvedValue([]),
      onDragging: vi.fn((listener: (on: boolean) => void) => {
        events.dragging = listener;
        return () => {};
      }),
      snapshot: vi.fn().mockResolvedValue({ revision: 1, active: null, tabs: documents.records ?? [] }),
      activated: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      reopenClosed: vi.fn().mockResolvedValue(undefined),
      move: vi.fn().mockResolvedValue(undefined),
      rendering: vi.fn().mockResolvedValue(undefined),
      rendered: vi.fn().mockResolvedValue(undefined),
      renderAgain: vi.fn().mockResolvedValue(undefined),
      position: vi.fn().mockResolvedValue(undefined),
      zoom: vi.fn().mockResolvedValue(undefined),
      width: vi.fn().mockResolvedValue(undefined),
      viewState: vi.fn().mockResolvedValue(undefined),
      openSettings: vi.fn().mockResolvedValue('settings-1'),
      onChanged: vi.fn((listener: (snapshot: TabSnapshot) => void) => {
        events.tabs = listener;
        return () => {};
      }),
      onDemote: vi.fn((listener: (ids: string[]) => void) => {
        events.demote = listener;
        return () => {};
      }),
      onStale: vi.fn((listener: (id: string) => void) => {
        events.stale = listener;
        return () => {};
      }),
    },
    recent: {
      list: vi.fn().mockResolvedValue([]),
      open: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    },
    drops: {
      open: vi.fn().mockResolvedValue({ folder: false }),
      onReceived: vi.fn(() => () => {}),
    },
    quickOpen: {
      start: vi.fn().mockResolvedValue({ token: 'qo-1', scope: null }),
      query: vi.fn().mockResolvedValue({ token: 'qo-1', query: '', sections: [] }),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      onResults: vi.fn(() => () => {}),
    },
    session: {
      previous: vi.fn().mockResolvedValue([]),
      restorePrevious: vi.fn().mockResolvedValue(undefined),
    },
    settings: {
      set: vi.fn().mockResolvedValue({ ok: true }),
      reset: vi.fn().mockResolvedValue({ ok: true }),
      openCustomCss: vi.fn().mockResolvedValue(undefined),
      openNoticeFile: vi.fn().mockResolvedValue(undefined),
      fonts: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue({ settings: { ...DEFAULT_SETTINGS }, notices: [], session: null, css: { global: '', profile: '' }, shared: { ...DEFAULT_SETTINGS }, sources: SOURCES }),
      onChanged: vi.fn((listener: (state: SettingsState) => void) => {
        events.settings = listener;
        return () => {};
      }),
    },
    profiles: {
      created: vi.fn().mockResolvedValue(null),
      undoCreate: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ current: 'default', profiles: [{ id: 'default', name: 'default', accent: '#8b5cf6', running: true }] }),
      open: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({ ok: true }),
      update: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue(undefined),
      onChanged: vi.fn((listener: (state: ProfilesState) => void) => {
        events.profiles = listener;
        return () => {};
      }),
    },
    window: { command: vi.fn().mockResolvedValue(undefined), retryAfterCrashes: vi.fn().mockResolvedValue(undefined) },
  } satisfies GaleoApi;
  Object.defineProperty(window, 'galeo', { value: api, configurable: true });
  return api;
}

function readyContent(format: FormatId, view: 'rendered' | 'source', text: string): DocumentContent {
  return { state: 'ready', path: '/d/x', format, view, banner: null, text, encoding: 'utf-8', guessedEncoding: false, size: text.length, version: 'v1' };
}

async function documentShadow(container: HTMLElement): Promise<ShadowRoot> {
  return vi.waitFor(() => {
    const shadow = container.querySelector('[data-testid="document"]')?.shadowRoot;
    if (!shadow) throw new Error('no document yet');
    return shadow;
  });
}

async function press(init: KeyboardEventInit) {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  });
}

// Every test's app is unmounted afterwards: a live one would still hear the next test's keys.
const roots: Root[] = [];

async function renderApp() {
  const { App } = await import('./App');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(<App />);
  });
  return container;
}

describe('App', () => {
  // The first import loads the whole UI (React Aria, CodeMirror); on a busy machine that alone
  // can outlast a test's timeout, and it isn't what any test here checks.
  beforeAll(() => import('./App'), 30_000);

  afterEach(() => {
    act(() => roots.splice(0).forEach((root) => root.unmount()));
    document.body.innerHTML = '';
    renderRequests.length = 0;
    renderFormats.length = 0;
    workerMode = 'answer';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('marks the root ready once the render worker answers the handshake', async () => {
    stubBridge();
    const container = await renderApp();
    expect(container.querySelector('[data-testid="app-root"]')?.getAttribute('data-worker')).toBe('ready');
    expect(container.querySelector('[data-testid="unsandboxed-badge"]')).toBeNull();
  });

  it('shows the unsandboxed badge when main reports no sandbox', async () => {
    stubBridge({ sandboxed: false });
    const container = await renderApp();
    expect(container.querySelector('[data-testid="unsandboxed-badge"]')).not.toBeNull();
  });

  it('applies the system colour scheme to the app and follows it live', async () => {
    const query = Object.assign(new EventTarget(), { matches: true });
    const other = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal('matchMedia', (media: string) => (media === '(prefers-color-scheme: dark)' ? query : other));
    stubBridge();
    await renderApp();
    expect(document.documentElement.dataset['scheme']).toBe('dark');
    await act(async () => {
      query.matches = false;
      query.dispatchEvent(new Event('change'));
    });
    expect(document.documentElement.dataset['scheme']).toBe('light');
  });

  it("uses its profile's theme mode over the desktop's, and the desktop's in system mode", async () => {
    const query = Object.assign(new EventTarget(), { matches: true });
    const other = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal('matchMedia', (media: string) => (media === '(prefers-color-scheme: dark)' ? query : other));
    const api = stubBridge();
    api.settings.get.mockResolvedValue({ settings: { ...DEFAULT_SETTINGS, themeMode: 'light' }, notices: [], session: null, css: { global: '', profile: '' }, shared: { ...DEFAULT_SETTINGS }, sources: SOURCES });
    await renderApp();
    await vi.waitFor(() => expect(document.documentElement.dataset['scheme']).toBe('light'));
    await act(async () => events.settings?.({ settings: { ...DEFAULT_SETTINGS, themeMode: 'system' }, notices: [], session: null, css: { global: '', profile: '' }, shared: { ...DEFAULT_SETTINGS }, sources: SOURCES }));
    expect(document.documentElement.dataset['scheme']).toBe('dark');
  });

  it("applies the profile's reading settings as tokens and its custom CSS inside documents", async () => {
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: readyContent('markdown', 'rendered', 'hello') });
    api.settings.get.mockResolvedValue({
      settings: { ...DEFAULT_SETTINGS, fontSize: 20, measure: 90, proseFont: 'Source Serif 4' },
      notices: [],
      session: null,
      css: { global: 'article { color: red; }', profile: 'article { color: blue; }' },
      shared: { ...DEFAULT_SETTINGS },
      sources: SOURCES,
    });
    const container = await renderApp();
    const root = document.documentElement.style;
    await vi.waitFor(() => expect(root.getPropertyValue('--galeo-font-size')).toBe('20px'));
    expect(root.getPropertyValue('--galeo-measure')).toBe('90ch');
    expect(root.getPropertyValue('--galeo-font-prose')).toContain('Source Serif 4');
    const shadow = await documentShadow(container);
    const rules = shadow.adoptedStyleSheets.map((sheet) => [...sheet.cssRules].map((rule) => rule.cssText).join(' '));
    expect(rules.at(-2)).toContain('red');
    expect(rules.at(-1)).toContain('blue');
    expect(document.adoptedStyleSheets.some((sheet) => [...sheet.cssRules].some((rule) => rule.cssText.includes('blue')))).toBe(false);
  });

  it("renders the window's first document through the worker", async () => {
    const content: DocumentContent = {
      state: 'ready',
      path: '/d/a.md',
      format: 'markdown',
      view: 'rendered',
      banner: null,
      text: 'hello',
      encoding: 'utf-8',
      guessedEncoding: false,
      size: 5,
      version: 'v1',
    };
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content });
    const container = await renderApp();
    await vi.waitFor(() => {
      const shadow = container.querySelector('[data-testid="document"]')?.shadowRoot;
      expect(shadow?.querySelector('article')?.innerHTML).toBe('<p>hello</p>');
    });
    expect(api.documents.read).toHaveBeenCalledWith('doc-1');
  });

  it('renders an MDX article through the worker as MDX, and opens it in split', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.mdx' }], content: readyContent('mdx', 'rendered', '# hi') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('article')?.innerHTML).toBe('<p># hi</p>'));
    expect(renderFormats).toEqual(['mdx']);
    await press({ key: '\\', ctrlKey: true });
    await vi.waitFor(() => expect(shadow.querySelector<HTMLElement>('.galeo-split-divider')?.hidden).toBe(false), { timeout: 5_000 });
  });

  it('switches a Markdown document to its source and back with Ctrl+U', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: readyContent('markdown', 'rendered', '# hi') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('article')?.innerHTML).toBe('<p># hi</p>'));
    await press({ key: 'u', ctrlKey: true });
    // The editor loads the first time a source view shows (a slow runner can take over a second).
    await vi.waitFor(() => expect(shadow.querySelector<HTMLElement>('article')?.hidden).toBe(true), { timeout: 5_000 });
    expect(shadow.querySelector('.cm-editor')?.textContent).toContain('# hi');
    await press({ key: 'u', ctrlKey: true });
    expect(shadow.querySelector<HTMLElement>('article')?.hidden).toBe(false);
    expect(shadow.querySelector<HTMLElement>('.galeo-source')?.hidden).toBe(true);
  });

  it('toggles line wrapping in the source view with Alt+Z', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.cfg' }], content: readyContent('plain', 'source', 'x') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('.cm-editor')).not.toBeNull());
    expect(shadow.querySelector('.cm-lineWrapping')).toBeNull();
    await press({ key: 'z', altKey: true });
    expect(shadow.querySelector('.cm-lineWrapping')).not.toBeNull();
  });

  it('keeps a document without a rendered view in its source view on Ctrl+U', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.cfg' }], content: readyContent('plain', 'source', 'x') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('.cm-editor')).not.toBeNull());
    await press({ key: 'u', ctrlKey: true });
    expect(shadow.querySelector<HTMLElement>('.galeo-source')?.hidden).toBe(false);
  });

  it('renders oversized Markdown only when switched to the rendered view', async () => {
    const content = { ...readyContent('markdown', 'source', '# big'), banner: 'too-large' as const };
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/big.md' }], content });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('.cm-editor')).not.toBeNull());
    expect(shadow.querySelector('article')?.innerHTML).toBe('');
    expect(renderRequests).toEqual([]);
    await press({ key: 'u', ctrlKey: true });
    await vi.waitFor(() => expect(shadow.querySelector('article')?.innerHTML).toBe('<p># big</p>'));
  });

  it('shows .txt in the reader view and its source on Ctrl+U, without the worker', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.txt' }], content: readyContent('text', 'rendered', 'a\n\nb') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelectorAll('article.galeo-text-reader p')).toHaveLength(2));
    expect(renderRequests).toEqual([]);
    await press({ key: 'u', ctrlKey: true });
    expect(shadow.querySelector<HTMLElement>('.galeo-source')?.hidden).toBe(false);
  });

  it("counts lines only in a view that shows them, in the document's metrics with its words", async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.txt' }], content: readyContent('text', 'rendered', 'a\n\nb') });
    const container = await renderApp();
    const metrics = () => container.querySelector('[data-testid="status-metrics"]')?.textContent;
    // The reader view wraps its paragraphs to the window: the file's lines aren't what it shows.
    await vi.waitFor(() => expect(metrics()).toBe('2 words · < 1 min'));
    await press({ key: 'u', ctrlKey: true });
    await vi.waitFor(() => expect(metrics()).toBe('3 ln · 2 words · < 1 min'));
  });

  it('zooms the shown tab with Ctrl and the wheel: up zooms in, down zooms out', async () => {
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.txt' }], content: readyContent('text', 'rendered', 'a') });
    const container = await renderApp();
    await documentShadow(container);
    const zoom = () => container.querySelector('[data-testid="status-zoom"]')?.textContent;
    const turn = (deltaY: number, ctrlKey = true) => {
      const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
      // happy-dom's WheelEvent leaves out the modifier keys it's given.
      Object.defineProperty(event, 'ctrlKey', { value: ctrlKey });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(turn(-120)).toBe(true);
    await vi.waitFor(() => expect(zoom()).toBe('110%'));
    expect(api.tabs.zoom).toHaveBeenLastCalledWith('doc-1', 1.1);
    turn(120);
    await vi.waitFor(() => expect(zoom()).toBeUndefined());
    // Without Ctrl the wheel scrolls, as always.
    expect(turn(-120, false)).toBe(false);
    expect(zoom()).toBeUndefined();
  });

  it("widens the shown tab's reading column with Alt, shows it while it differs from the setting, and resets it", async () => {
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.txt' }], content: readyContent('text', 'rendered', 'a') });
    api.settings.get.mockResolvedValue({ settings: { ...DEFAULT_SETTINGS, measure: 90 }, notices: [], session: null, css: { global: '', profile: '' }, shared: { ...DEFAULT_SETTINGS }, sources: SOURCES });
    const container = await renderApp();
    await documentShadow(container);
    const shown = () => container.querySelector('[data-testid="status-width"]')?.textContent;
    const column = () => container.querySelector<HTMLElement>('[data-testid="tab-panel"]')!.style.getPropertyValue('--galeo-measure');
    await vi.waitFor(() => expect(container.querySelector('[data-testid="status-view"]')?.textContent).toBe('Reader'));
    expect(shown()).toBeUndefined();
    await press({ key: '=', altKey: true });
    await vi.waitFor(() => expect(shown()).toBe('96 ch'));
    expect(column()).toBe('96ch');
    expect(api.tabs.width).toHaveBeenLastCalledWith('doc-1', 96);
    await press({ key: '0', altKey: true });
    await vi.waitFor(() => expect(shown()).toBeUndefined());
    expect(column()).toBe('');
    expect(api.tabs.width).toHaveBeenLastCalledWith('doc-1', null);
  });

  describe('moving the shown tab to another window from the palette (UX F15)', () => {
    const twoTabs = () =>
      stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }, { id: 'doc-2', path: '/d/b.md' }], content: readyContent('markdown', 'rendered', '# a') });
    const runFromPalette = async (label: string) => {
      await press({ key: 'P', ctrlKey: true, shiftKey: true });
      const entry = await vi.waitFor(() => {
        const found = [...document.querySelectorAll<HTMLElement>('[data-testid="palette-list"] [role="option"]')].find((option) => option.textContent?.startsWith(label));
        if (!found) throw new Error(`no "${label}" in the palette`);
        return found;
      });
      await act(async () => entry.click());
    };
    const message = (container: HTMLElement) => container.querySelector('[data-testid="status-message"]')?.textContent;

    it('moves it to a new window', async () => {
      const api = twoTabs();
      const container = await renderApp();
      await documentShadow(container);
      await runFromPalette('Move tab to new window');
      await vi.waitFor(() => expect(api.tabs.moveTo).toHaveBeenCalledWith('doc-1', 'new'));
    });

    it("says so, and asks main nothing, when it is the window's only tab", async () => {
      const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: readyContent('markdown', 'rendered', '# a') });
      const container = await renderApp();
      await documentShadow(container);
      await runFromPalette('Move tab to new window');
      await vi.waitFor(() => expect(message(container)).toBe("It's this window's only tab"));
      expect(api.tabs.moveTo).not.toHaveBeenCalled();
    });

    it('moves it to the window chosen from the list of the others', async () => {
      const api = twoTabs();
      api.tabs.windows.mockResolvedValue([{ window: 7, profile: 'Work', accent: null, shows: 'notes.md' }]);
      const container = await renderApp();
      await documentShadow(container);
      await runFromPalette('Move tab to window…');
      const option = await vi.waitFor(() => document.querySelector<HTMLElement>('[data-testid="move-tab"] [role="option"]')!);
      await act(async () => option.click());
      await vi.waitFor(() => expect(api.tabs.moveTo).toHaveBeenCalledWith('doc-1', 7));
      expect(document.querySelector('[data-testid="move-tab"]')).toBeNull();
    });

    it('says the tab stayed when main refused the move', async () => {
      const api = twoTabs();
      api.tabs.moveTo.mockResolvedValue(false);
      const container = await renderApp();
      await documentShadow(container);
      await runFromPalette('Move tab to new window');
      await vi.waitFor(() => expect(message(container)).toBe("The tab didn't move"));
    });
  });

  it('leaves the width alone where there is no reading column, and says why', async () => {
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.txt' }], content: readyContent('text', 'rendered', 'a') });
    const container = await renderApp();
    await documentShadow(container);
    await press({ key: 'u', ctrlKey: true });
    await vi.waitFor(() => expect(container.querySelector('[data-testid="status-view"]')?.textContent).toBe('Source'));
    await press({ key: '=', altKey: true });
    await vi.waitFor(() => expect(container.querySelector('[data-testid="status-message"]')?.textContent).toBe('Reader width applies to the rendered view'));
    expect(container.querySelector('[data-testid="status-width"]')).toBeNull();
    expect(api.tabs.width).not.toHaveBeenCalled();
  });

  it('shows a log with level badges and follows its end on End until scrolled up', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/app.log' }], content: readyContent('log', 'source', 'INFO a\nERROR b\n') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('.galeo-log-gutter')).not.toBeNull());
    const documentElement = container.querySelector<HTMLElement>('[data-testid="document"]')!;
    expect(documentElement.dataset['follow']).toBe('off');
    await press({ key: 'End' });
    expect(documentElement.dataset['follow']).toBe('on');
    const scroller = shadow.querySelector<HTMLElement>('.cm-scroller')!;
    // happy-dom lays nothing out: give the log a height, so scrolling up leaves its end.
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 });
    await act(async () => {
      scroller.scrollTop = 100;
      scroller.dispatchEvent(new Event('scroll'));
      scroller.scrollTop = 40;
      scroller.dispatchEvent(new Event('scroll'));
    });
    expect(documentElement.dataset['follow']).toBe('off');
  });

  it('leaves End and Alt+arrows to the find field while typing in it', async () => {
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/app.log' }], content: readyContent('log', 'source', 'INFO a\n') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('.cm-editor')).not.toBeNull());
    await press({ key: 'f', ctrlKey: true });
    const input = container.querySelector<HTMLInputElement>('.find-bar input')!;
    const typing = async (init: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      await act(async () => input.dispatchEvent(event));
      return event.defaultPrevented;
    };
    expect(await typing({ key: 'End' })).toBe(false);
    expect(await typing({ key: 'ArrowLeft', altKey: true })).toBe(false);
    expect(container.querySelector<HTMLElement>('[data-testid="document"]')?.dataset['follow']).toBe('off');
    expect(api.documents.back).not.toHaveBeenCalled();
  });

  it('ignores End outside logs', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.cfg' }], content: readyContent('plain', 'source', 'x') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('.cm-editor')).not.toBeNull());
    await press({ key: 'End' });
    expect(container.querySelector<HTMLElement>('[data-testid="document"]')?.dataset['follow']).toBe('off');
  });

  it('opens find with Ctrl+F, counts matches as the user types, and steps with F3', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.cfg' }], content: readyContent('plain', 'source', 'plan\nplan\nplan') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('.cm-editor')).not.toBeNull());
    await press({ key: 'f', ctrlKey: true });
    const input = container.querySelector<HTMLInputElement>('.find-bar input')!;
    expect(document.activeElement).toBe(input);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'plan');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const status = container.querySelector('.find-bar [role="status"]')!;
    expect(status.textContent).toBe('1 of 3');
    await press({ key: 'F3' });
    expect(status.textContent).toBe('2 of 3');
    await press({ key: 'F3', shiftKey: true });
    expect(status.textContent).toBe('1 of 3');
  });

  it('closes find with Esc, clearing the highlights and returning focus to the document', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.cfg' }], content: readyContent('plain', 'source', 'a a') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('.cm-editor')).not.toBeNull());
    await press({ key: 'f', ctrlKey: true });
    const input = container.querySelector<HTMLInputElement>('.find-bar input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'a');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(shadow.querySelectorAll('.cm-searchMatch').length).toBeGreaterThan(0);
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(container.querySelector('.find-bar')).toBeNull();
    expect(shadow.querySelectorAll('.cm-searchMatch')).toHaveLength(0);
    expect(document.activeElement).toBe(container.querySelector('[data-testid="document"]'));
  });

  it('follows a clicked link through main, reading the document it navigated to', async () => {
    const first = readyContent('markdown', 'rendered', '[next](next.md)');
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: first });
    api.documents.read.mockResolvedValueOnce(first).mockResolvedValueOnce(readyContent('markdown', 'rendered', 'second'));
    api.documents.followLink.mockResolvedValue({ kind: 'navigated', anchor: null });
    workerMode = 'links';
    const container = await renderApp();
    const shadow = await documentShadow(container);
    const link = await vi.waitFor(() => shadow.querySelector<HTMLAnchorElement>('a[href="next.md"]')!);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
    await act(async () => link.dispatchEvent(click));
    expect(click.defaultPrevented).toBe(true);
    expect(api.documents.followLink).toHaveBeenCalledWith('doc-1', 'next.md', 'current');
    // The navigated document is a new pane, with a new document container.
    await vi.waitFor(async () => expect((await documentShadow(container)).querySelector('article')?.textContent).toContain('second'));
    expect(api.documents.read).toHaveBeenCalledTimes(2);
  });

  it('scrolls to the anchor main confirms, by its prefixed id', async () => {
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: readyContent('markdown', 'rendered', '[go](#goals)') });
    api.documents.followLink.mockResolvedValue({ kind: 'anchor', anchor: 'goals' });
    workerMode = 'links';
    const scrolled: string[] = [];
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
      scrolled.push(this.id);
    });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    const link = await vi.waitFor(() => shadow.querySelector<HTMLAnchorElement>('a[href="#goals"]')!);
    await act(async () => link.click());
    await vi.waitFor(() => expect(scrolled).toContain('user-content-goals'));
  });

  it("lands on the anchor of a link to another file in that file, not the one it came from", async () => {
    const first = readyContent('markdown', 'rendered', '[next](next.md#goals)');
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: first });
    api.documents.read.mockResolvedValueOnce(first).mockResolvedValueOnce(readyContent('markdown', 'rendered', 'second'));
    api.documents.followLink.mockResolvedValue({ kind: 'navigated', anchor: 'goals' });
    workerMode = 'links';
    const scrolledIn: string[] = [];
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
      scrolledIn.push((this.getRootNode() as ShadowRoot).querySelector('article p')?.textContent ?? '');
    });
    const container = await renderApp();
    const link = await vi.waitFor(async () => (await documentShadow(container)).querySelector<HTMLAnchorElement>('a[href="next.md#goals"]')!);
    await act(async () => link.click());
    await vi.waitFor(() => expect(scrolledIn).toContain('second'));
    expect(scrolledIn).not.toContain('next');
  });

  it('says so in the status bar when main refuses a link', async () => {
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: readyContent('markdown', 'rendered', '[x](https://x.example)') });
    api.documents.followLink.mockResolvedValue({ kind: 'refused', reason: 'rate-limited' });
    workerMode = 'links';
    const container = await renderApp();
    const shadow = await documentShadow(container);
    const link = await vi.waitFor(() => shadow.querySelector<HTMLAnchorElement>('a[href="https://x.example"]')!);
    await act(async () => link.click());
    await vi.waitFor(() =>
      expect(container.querySelector('[data-testid="status-message"]')?.textContent).toBe(
        'Links open at most once a second',
      ),
    );
  });

  it('goes back and forward with Alt+Left and Alt+Right', async () => {
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/b.md' }], content: readyContent('markdown', 'rendered', 'b') });
    api.documents.back.mockResolvedValue({ kind: 'navigated', anchor: null });
    const container = await renderApp();
    await documentShadow(container);
    await press({ key: 'ArrowLeft', altKey: true });
    expect(api.documents.back).toHaveBeenCalledWith('doc-1');
    await vi.waitFor(() => expect(api.documents.read).toHaveBeenCalledTimes(2));
    await press({ key: 'ArrowRight', altKey: true });
    expect(api.documents.forward).toHaveBeenCalledWith('doc-1');
  });

  it.each([
    [{ state: 'empty', path: '/d/e.md', format: 'markdown' }, 'This file is empty'],
    [{ state: 'missing', path: '/d/gone.md' }, 'File not found'],
    [{ state: 'no-permission', path: '/d/secret.md' }, "galeo can't read this file (permission denied)"],
    [{ state: 'binary', path: '/d/x.png', size: 1536 }, 'This looks like a binary file'],
    [{ state: 'not-a-file', path: '/d/folder' }, "This isn't a regular file"],
    [{ state: 'too-large', path: '/d/huge.log', maxBytes: 256 * 1024 * 1024 }, 'This file is too large to open'],
    [{ state: 'unreadable', path: '/d/odd' }, "galeo can't read this file"],
  ] as [DocumentContent, string][])('shows the %j state with its message and path', async (content, message) => {
    stubBridge({}, { records: [{ id: 'doc-1', path: content.path }], content });
    const container = await renderApp();
    const state = await vi.waitFor(() => {
      const element = container.querySelector('[data-testid="document-state"]');
      if (!element) throw new Error('no state yet');
      return element;
    });
    expect(state.getAttribute('data-state')).toBe(content.state);
    expect(state.querySelector('.document-state-title')?.textContent).toBe(message);
    expect(state.textContent).toContain(content.path);
  });

  it('gives a binary file its size and type', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/x.png' }], content: { state: 'binary', path: '/d/x.png', size: 1536 } });
    const container = await renderApp();
    await vi.waitFor(() => expect(container.querySelector('[data-testid="document-state"]')?.textContent).toContain('1.5 KB · PNG'));
  });

  it('shows oversized Markdown as source with a banner offering to render it anyway', async () => {
    const content = { ...readyContent('markdown', 'source', '# big'), banner: 'too-large' as const };
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/big.md' }], content });
    const container = await renderApp();
    const banner = await vi.waitFor(() => container.querySelector<HTMLElement>('[data-banner="too-large"]')!);
    expect(banner.textContent).toContain('Large file shown as source');
    await act(async () => banner.querySelector('button')!.click());
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('article')?.innerHTML).toBe('<p># big</p>'));
    expect(container.querySelector('[data-banner="too-large"]')).toBeNull();
  });

  it('names the guessed encoding in a banner', async () => {
    const content = { ...readyContent('text', 'rendered', 'café'), encoding: 'windows-1252' as const, guessedEncoding: true };
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/latin.txt' }], content });
    const container = await renderApp();
    await vi.waitFor(() =>
      expect(container.querySelector('[data-banner="encoding"]')?.textContent).toContain('Windows-1252'),
    );
  });

  it('falls back to the source view when rendering fails, and can try again', async () => {
    workerMode = 'fail';
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: readyContent('markdown', 'rendered', '# x') });
    const container = await renderApp();
    const banner = await vi.waitFor(() => container.querySelector<HTMLElement>('[data-banner="render-failed"]')!);
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector<HTMLElement>('.galeo-source')?.hidden).toBe(false));
    workerMode = 'answer';
    await act(async () => banner.querySelector('button')!.click());
    await vi.waitFor(() => expect(shadow.querySelector('article')?.innerHTML).toBe('<p># x</p>'));
    expect(container.querySelector('[data-banner="render-failed"]')).toBeNull();
  });

  it('shows the source of an MDX file with a syntax error, saying on which line', async () => {
    workerMode = 'syntax';
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.mdx' }], content: readyContent('mdx', 'rendered', 'a <3') });
    const container = await renderApp();
    const banner = await vi.waitFor(() => container.querySelector<HTMLElement>('[data-banner="syntax-error"]')!);
    expect(banner.textContent).toBe('MDX syntax error on line 3: Unexpected character `3` — showing source');
    expect(banner.querySelector('button')).toBeNull();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector<HTMLElement>('.galeo-source')?.hidden).toBe(false));
  });

  it('shows the source of a document too slow to render, and renders it anyway on request', { timeout: 10_000 }, async () => {
    workerMode = 'hang';
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: readyContent('markdown', 'rendered', '# x') });
    const container = await renderApp();
    // The render budget runs out (2 s); the worker is replaced.
    const banner = await vi.waitFor(
      () => {
        const shown = container.querySelector<HTMLElement>('[data-banner="render-slow"]');
        expect(shown).not.toBeNull();
        return shown!;
      },
      { timeout: 4000 },
    );
    expect(banner.textContent).toContain('Too slow to render — showing source');
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector<HTMLElement>('.galeo-source')?.hidden).toBe(false));
    workerMode = 'answer';
    await act(async () => banner.querySelector('button')!.click());
    await vi.waitFor(() => expect(shadow.querySelector('article')?.innerHTML).toBe('<p># x</p>'));
    expect(container.querySelector('[data-banner="render-slow"]')).toBeNull();
  });

  it('tells main which tab it is about to render, before it reports it rendered', async () => {
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: readyContent('markdown', 'rendered', '# x') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('article')?.innerHTML).toBe('<p># x</p>'));
    await vi.waitFor(() => expect(api.tabs.rendered).toHaveBeenCalled());
    expect(api.tabs.rendering).toHaveBeenCalledWith('doc-1');
    expect(api.tabs.rendering.mock.invocationCallOrder[0]).toBeLessThan(api.tabs.rendered.mock.invocationCallOrder.at(-1)!);
  });

  describe('a tab that crashed the window', () => {
    const crashed = { id: 'doc-1', path: '/d/a.md', crashed: true } as DocumentRecord;
    const crashPanel = (container: HTMLElement) =>
      vi.waitFor(() => {
        const panel = container.querySelector<HTMLElement>('[data-testid="document-state"][data-state="crashed"]');
        expect(panel).not.toBeNull();
        return panel!;
      });
    const button = (panel: HTMLElement, name: string) => [...panel.querySelectorAll('button')].find((each) => each.textContent === name)!;

    it('is not read or rendered, says so, and is marked in the tab bar', async () => {
      const api = stubBridge({}, { records: [crashed], content: readyContent('markdown', 'rendered', '# x') });
      const container = await renderApp();
      const panel = await crashPanel(container);
      expect(panel.textContent).toContain("This document crashed the viewer and won't be rendered automatically");
      expect(panel.textContent).toContain('/d/a.md');
      expect(api.documents.read).not.toHaveBeenCalled();
      expect(container.querySelector('[role="tab"]')?.textContent).toContain('crashed the viewer');
    });

    it('renders again on Try again', async () => {
      const api = stubBridge({}, { records: [crashed], content: readyContent('markdown', 'rendered', '# x') });
      const container = await renderApp();
      await act(async () => button(await crashPanel(container), 'Try again').click());
      expect(api.tabs.renderAgain).toHaveBeenCalledWith('doc-1');
      expect(api.tabs.viewState).not.toHaveBeenCalled();
      await act(async () => events.tabs!({ revision: 2, active: 'doc-1', tabs: [{ id: 'doc-1', path: '/d/a.md' }] }));
      await vi.waitFor(() => expect(api.documents.read).toHaveBeenCalledWith('doc-1'));
    });

    it('opens in the source view on Open as source', async () => {
      const api = stubBridge({}, { records: [crashed], content: readyContent('markdown', 'rendered', '# x') });
      const container = await renderApp();
      await act(async () => button(await crashPanel(container), 'Open as source').click());
      expect(api.tabs.viewState).toHaveBeenCalledWith('doc-1', { view: 'source' });
      expect(api.tabs.renderAgain).toHaveBeenCalledWith('doc-1');
    });
  });

  it('shows a loading skeleton only once rendering takes longer than 150 ms', async () => {
    workerMode = 'hang';
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: readyContent('markdown', 'rendered', '# x') });
    const started = performance.now();
    const container = await renderApp();
    await vi.waitFor(() => expect(container.querySelector('[data-testid="document-loading"]')).not.toBeNull());
    expect(performance.now() - started).toBeGreaterThanOrEqual(140);
  });

  it('shows no skeleton for a fast render', async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: readyContent('markdown', 'rendered', '# x') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await vi.waitFor(() => expect(shadow.querySelector('article')?.innerHTML).toBe('<p># x</p>'));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(container.querySelector('[data-testid="document-loading"]')).toBeNull();
  });

  it('shows the empty window: hints, the recent files to open, and previous sessions to restore', async () => {
    const api = stubBridge();
    api.recent.list.mockResolvedValue([
      { id: 'pick-1', path: '/w/acme/plan.md' },
      { id: 'pick-2', path: '/w/beta/notes.md' },
    ]);
    api.session.previous.mockResolvedValue([{ snapshot: 1, savedAt: Date.UTC(2026, 8, 27, 18, 30), windows: 1, tabs: 4 }]);
    const container = await renderApp();
    const empty = await vi.waitFor(() => container.querySelector<HTMLElement>('[data-testid="empty-window"]')!);
    expect(empty.textContent).toContain('Drop files here');
    expect(empty.textContent).toContain('Ctrl+P');
    const buttons = () => [...empty.querySelectorAll('button')];
    await vi.waitFor(() => expect(buttons().map((button) => button.textContent)).toContain('plan.md/w/acme'));
    await act(async () => buttons().find((button) => button.textContent?.startsWith('plan.md'))!.click());
    expect(api.recent.open).toHaveBeenCalledWith('pick-1');
    await act(async () => buttons().find((button) => button.textContent === 'Clear recent')!.click());
    expect(api.recent.clear).toHaveBeenCalled();
    await act(async () => buttons().find((button) => button.textContent?.includes('4 tabs'))!.click());
    expect(api.session.restorePrevious).toHaveBeenCalledWith(1);
  });

  it('shows no document when the window has none', async () => {
    const api = stubBridge();
    const container = await renderApp();
    await vi.waitFor(() => expect(api.tabs.snapshot).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="document"]')).toBeNull();
    expect(api.documents.read).not.toHaveBeenCalled();
  });

  it("renders a tab once shown, keeps it warm and hidden after, and gives keys to the shown one only", async () => {
    const records = [
      { id: 'doc-1', path: '/d/a.md' },
      { id: 'doc-2', path: '/d/b.md' },
    ];
    const api = stubBridge({}, { records });
    api.documents.read.mockImplementation(async (id: string) => readyContent('markdown', 'rendered', `text of ${id}`));
    const container = await renderApp();
    const panels = () => [...container.querySelectorAll<HTMLElement>('[data-testid="tab-panel"]')];
    await vi.waitFor(() => expect(container.querySelectorAll('[data-testid="document"]')).toHaveLength(1));
    expect(panels().map((panel) => panel.dataset['active'])).toEqual(['true', 'false']);
    expect(api.documents.read).toHaveBeenCalledTimes(1);
    expect(api.tabs.activated).toHaveBeenCalledWith('doc-1');
    await press({ key: 'Tab', ctrlKey: true });
    await vi.waitFor(() => expect(container.querySelectorAll('[data-testid="document"]')).toHaveLength(2));
    expect(panels()[0]!.inert).toBe(true);
    await press({ key: 'u', ctrlKey: true });
    const shadows = panels().map((panel) => panel.querySelector('[data-testid="document"]')!.shadowRoot!);
    await vi.waitFor(() => expect(shadows[1]!.querySelector('.cm-editor')).not.toBeNull());
    expect(shadows[0]!.querySelector('.cm-editor')).toBeNull();
  });

  it("follows main's snapshots: a tab it adds waits hibernated, a tab it drops goes", async () => {
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }] });
    api.documents.read.mockImplementation(async (id: string) => readyContent('markdown', 'rendered', `text of ${id}`));
    const container = await renderApp();
    await vi.waitFor(() => expect(container.querySelectorAll('[data-testid="tab-panel"]')).toHaveLength(1));
    await act(async () =>
      events.tabs?.({ revision: 2, active: 'doc-1', tabs: [{ id: 'doc-1', path: '/d/a.md' }, { id: 'doc-2', path: '/d/b.md' }] }),
    );
    expect(container.querySelectorAll('[data-testid="tab-panel"]')).toHaveLength(2);
    expect(api.documents.read).not.toHaveBeenCalledWith('doc-2');
    await act(async () => events.tabs?.({ revision: 3, active: 'doc-1', tabs: [{ id: 'doc-1', path: '/d/a.md' }] }));
    expect(container.querySelectorAll('[data-testid="tab-panel"]')).toHaveLength(1);
  });

  it('drops a hibernated tab\'s document and reads it again when shown, reporting its weight', async () => {
    const records = [
      { id: 'doc-1', path: '/d/a.md' },
      { id: 'doc-2', path: '/d/b.md' },
    ];
    const api = stubBridge({}, { records });
    api.documents.read.mockImplementation(async (id: string) => readyContent('markdown', 'rendered', `text of ${id}`));
    const container = await renderApp();
    await vi.waitFor(() => expect(api.tabs.rendered).toHaveBeenCalledWith('doc-1', 2 * '<p>text of doc-1</p>'.length));
    await press({ key: 'Tab', ctrlKey: true });
    await vi.waitFor(() => expect(container.querySelectorAll('[data-testid="document"]')).toHaveLength(2));
    await act(async () => events.demote?.(['doc-1']));
    expect(container.querySelectorAll('[data-testid="document"]')).toHaveLength(1);
    await press({ key: 'Tab', ctrlKey: true });
    await vi.waitFor(() => expect(api.documents.read.mock.calls.filter(([id]) => id === 'doc-1')).toHaveLength(2));
  });

  it('reads a tab again when main says its file changed', async () => {
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }] });
    api.documents.read.mockResolvedValueOnce(readyContent('markdown', 'rendered', 'before'));
    api.documents.read.mockResolvedValueOnce(readyContent('markdown', 'rendered', 'after'));
    const container = await renderApp();
    await vi.waitFor(async () => expect((await documentShadow(container)).querySelector('article')?.textContent).toBe('before'));
    await act(async () => events.stale?.('doc-1'));
    await vi.waitFor(async () => expect((await documentShadow(container)).querySelector('article')?.textContent).toBe('after'));
  });

  it('opens a Ctrl+clicked link in a background tab through main, staying on this document', async () => {
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: readyContent('markdown', 'rendered', '[next](next.md)') });
    api.documents.followLink.mockResolvedValue({ kind: 'opened' });
    workerMode = 'links';
    const container = await renderApp();
    const shadow = await documentShadow(container);
    const link = await vi.waitFor(() => shadow.querySelector<HTMLAnchorElement>('a[href="next.md"]')!);
    await act(async () => link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, ctrlKey: true })));
    expect(api.documents.followLink).toHaveBeenCalledWith('doc-1', 'next.md', 'background');
    expect(api.documents.read).toHaveBeenCalledTimes(1);
  });

  it('names a config file that was left untouched, until it is fixed or dismissed', async () => {
    const api = stubBridge();
    const notice = { path: '/cfg/settings.json', reason: 'invalid' as const, detail: 'Unexpected token' };
    api.settings.get.mockResolvedValue({ settings: { ...DEFAULT_SETTINGS }, notices: [notice], session: null, css: { global: '', profile: '' }, shared: { ...DEFAULT_SETTINGS }, sources: SOURCES });
    const container = await renderApp();
    const shown = () => container.querySelector('[data-testid="settings-notice"]');
    await vi.waitFor(() => expect(shown()?.textContent).toContain('/cfg/settings.json'));
    expect(shown()?.textContent).toContain('left untouched');
    await act(async () => events.settings?.({ settings: { ...DEFAULT_SETTINGS }, notices: [], session: null, css: { global: '', profile: '' }, shared: { ...DEFAULT_SETTINGS }, sources: SOURCES }));
    expect(shown()).toBeNull();
    await act(async () => events.settings?.({ settings: { ...DEFAULT_SETTINGS }, notices: [notice], session: null, css: { global: '', profile: '' }, shared: { ...DEFAULT_SETTINGS }, sources: SOURCES }));
    const dismiss = [...shown()!.querySelectorAll('button')].find((button) => button.textContent === 'Dismiss')!;
    await act(async () => dismiss.click());
    expect(shown()).toBeNull();
  });

  it('lets the whole tab bar take a dragged tab while one is dragged in any window, not the window (ADR-019)', async () => {
    // A window with no tabs too: its bar still takes the drop.
    stubBridge();
    const container = await renderApp();
    const bar = () => container.querySelector<HTMLElement>('.tab-bar')!;
    await vi.waitFor(() => expect(bar()).not.toBeNull());
    expect(bar().dataset['tabDrag']).toBeUndefined();
    await act(async () => events.dragging!(true));
    expect(bar().dataset['tabDrag']).toBe('true');
    await act(async () => events.dragging!(false));
    expect(bar().dataset['tabDrag']).toBeUndefined();
  });

  it("shows the window's profile at the tab bar's start, in its accent, and follows changes to it", async () => {
    stubBridge();
    const container = await renderApp();
    const chip = () => container.querySelector('.tab-bar [data-testid="profile-chip"]');
    await vi.waitFor(() => expect(chip()?.textContent).toContain('default'));
    expect(document.documentElement.style.getPropertyValue('--galeo-color-accent')).toBe('#8b5cf6');
    await act(async () => events.profiles?.({ current: 'default', profiles: [{ id: 'default', name: 'Home', accent: '#d64545', running: true }] }));
    expect(chip()?.textContent).toContain('Home');
    expect(document.documentElement.style.getPropertyValue('--galeo-color-accent')).toBe('#d64545');
  });

  it('says when the saved session was invalid and an earlier one was restored', async () => {
    const api = stubBridge();
    const session = { path: '/state/profiles/default/session.json', reason: 'invalid' as const, detail: null };
    api.settings.get.mockResolvedValue({ settings: { ...DEFAULT_SETTINGS }, notices: [], session, css: { global: '', profile: '' }, shared: { ...DEFAULT_SETTINGS }, sources: SOURCES });
    const container = await renderApp();
    const shown = () => container.querySelector('[data-testid="session-notice"]');
    await vi.waitFor(() => expect(shown()?.textContent).toContain("couldn't be read"));
    expect(shown()?.textContent).toContain('the last saved one before it');
    await act(async () => [...shown()!.querySelectorAll('button')].find((button) => button.textContent === 'Dismiss')!.click());
    expect(shown()).toBeNull();
  });

  it('opens the settings tab on Ctrl+, and shows it as a tab named Settings, with no path below', async () => {
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: readyContent('markdown', 'rendered', 'hello') });
    const container = await renderApp();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true })));
    expect(api.tabs.openSettings).toHaveBeenCalled();
    await act(async () =>
      events.tabs?.({ revision: 5, active: 'settings-1', tabs: [{ id: 'doc-1', path: '/d/a.md' }, { id: 'settings-1', path: '', kind: 'settings' }] }),
    );
    await vi.waitFor(() => expect(container.querySelector('[data-testid="settings-view"]')).not.toBeNull());
    expect([...container.querySelectorAll('[role="tab"] .tab-label')].map((label) => label.textContent)).toContain('Settings');
    expect(container.querySelector('[data-testid="status-path"]')).toBeNull();
    expect(api.documents.read).not.toHaveBeenCalledWith('settings-1');
  });

  it("opens the file a settings notice names, by the notice's place, never its path", async () => {
    const api = stubBridge();
    const notice = { path: '/cfg/settings.json', reason: 'invalid' as const, detail: null };
    api.settings.get.mockResolvedValue({ settings: { ...DEFAULT_SETTINGS }, notices: [notice], session: null, css: { global: '', profile: '' }, shared: { ...DEFAULT_SETTINGS }, sources: SOURCES });
    const container = await renderApp();
    const open = await vi.waitFor(() => [...container.querySelectorAll('[data-testid="settings-notice"] button')].find((button) => button.textContent === 'Open file')!);
    await act(async () => (open as HTMLButtonElement).click());
    expect(api.settings.openNoticeFile).toHaveBeenCalledWith(0);
  });

  it('keeps a dismissed notice dismissed when main sends the same notices again', async () => {
    const api = stubBridge();
    const notice = { path: '/cfg/settings.json', reason: 'invalid' as const, detail: null };
    const session = { path: '/state/profiles/default/session.json', reason: 'invalid' as const, detail: null };
    const state = () => ({ settings: { ...DEFAULT_SETTINGS }, notices: [{ ...notice }], session: { ...session }, css: { global: '', profile: '' }, shared: { ...DEFAULT_SETTINGS }, sources: SOURCES });
    api.settings.get.mockResolvedValue(state());
    const container = await renderApp();
    for (const id of ['settings-notice', 'session-notice']) {
      const shown = await vi.waitFor(() => container.querySelector(`[data-testid="${id}"]`)!);
      await act(async () => [...shown.querySelectorAll('button')].find((button) => button.textContent === 'Dismiss')!.click());
    }
    // A custom.css or settings change re-sends the whole state, equal notices included.
    await act(async () => events.settings?.(state()));
    expect(container.querySelector('[data-testid="settings-notice"]')).toBeNull();
    expect(container.querySelector('[data-testid="session-notice"]')).toBeNull();
    // Fixed, then broken the same way again: it shows again.
    await act(async () => events.settings?.({ ...state(), notices: [] }));
    await act(async () => events.settings?.(state()));
    expect(container.querySelector('[data-testid="settings-notice"]')).not.toBeNull();
  });

  it('offers Undo for a profile --profile just created', async () => {
    const api = stubBridge();
    api.profiles.created.mockResolvedValue({ name: 'Acme', token: 'undo-1' });
    const container = await renderApp();
    const shown = () => container.querySelector('[data-testid="profile-created"]');
    await vi.waitFor(() => expect(shown()?.textContent).toContain("Created profile 'Acme'"));
    expect(shown()?.getAttribute('role')).toBe('status');
    const undo = [...shown()!.querySelectorAll('button')].find((button) => button.textContent === 'Undo')!;
    await act(async () => undo.click());
    expect(api.profiles.undoCreate).toHaveBeenCalledWith('undo-1');
    expect(shown()).toBeNull();
  });

  it('shows no profile notice for a window whose profile already existed', async () => {
    const api = stubBridge();
    const container = await renderApp();
    await vi.waitFor(() => expect(api.profiles.created).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="profile-created"]')).toBeNull();
  });

  it('dismisses the created-profile notice without undoing it', async () => {
    const api = stubBridge();
    api.profiles.created.mockResolvedValue({ name: 'Acme', token: 'undo-1' });
    const container = await renderApp();
    const shown = () => container.querySelector('[data-testid="profile-created"]');
    const dismiss = await vi.waitFor(() => [...shown()!.querySelectorAll('button')].find((button) => button.textContent === 'Dismiss')!);
    await act(async () => dismiss.click());
    expect(shown()).toBeNull();
    expect(api.profiles.undoCreate).not.toHaveBeenCalled();
  });

  it("asks main for the document's menu on a right-click, and shows no menu of its own", async () => {
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: readyContent('markdown', 'rendered', 'hello') });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    const paragraph = await vi.waitFor(() => shadow.querySelector('article p')!);
    const click = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true });
    await act(async () => paragraph.dispatchEvent(click));
    expect(click.defaultPrevented).toBe(true);
    expect(api.documents.contextMenu).toHaveBeenCalledWith('doc-1');
  });

  it("offers a state's actions: close the tab, or main's file menu", async () => {
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/x.png' }], content: { state: 'binary', path: '/d/x.png', size: 10 } });
    const container = await renderApp();
    const button = (name: string) => vi.waitFor(() => [...container.querySelectorAll('button')].find((each) => each.textContent === name)!);
    await act(async () => (await button('File actions…')).click());
    expect(api.documents.contextMenu).toHaveBeenCalledWith('doc-1');
    await act(async () => (await button('Close tab')).click());
    expect(api.tabs.close).toHaveBeenCalledWith('doc-1');
  });

  it('closes a tab per Ctrl+W, however fast they come', async () => {
    const records = ['doc-1', 'doc-2', 'doc-3'].map((id) => ({ id, path: `/d/${id}.md` }));
    const api = stubBridge({}, { records, content: readyContent('markdown', 'rendered', 'x') });
    const container = await renderApp();
    await vi.waitFor(() => expect(container.querySelectorAll('[data-testid="tab-panel"]')).toHaveLength(3));
    await act(async () => {
      for (let i = 0; i < 2; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, bubbles: true, cancelable: true }));
    });
    expect(api.tabs.close.mock.calls).toEqual([['doc-1'], ['doc-2']]);
  });

  it('shows only the sandbox choice and sends it to main', async () => {
    const api = stubBridge({ sandboxed: false, sandboxUnavailable: 'suid-helper' });
    const container = await renderApp();
    expect(container.querySelector('[data-testid="app-root"]')).toBeNull();
    const quit = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Quit');
    await act(async () => quit?.click());
    expect(api.app.resolveSandboxUnavailable).toHaveBeenCalledWith('quit');
  });

  it('shows only the crash-loop message in a window that kept crashing: Try again or Close window', async () => {
    const api = stubBridge({ crashLoop: true }, { records: [{ id: 'doc-1', path: '/d/x.md' }], content: readyContent('markdown', 'rendered', 'x') });
    const container = await renderApp();
    expect(container.querySelector('[data-testid="app-root"]')).toBeNull();
    expect(container.querySelector('h1')?.textContent).toBe("This window's viewer kept crashing");
    expect(api.documents.read).not.toHaveBeenCalled();
    const button = (name: string) => [...container.querySelectorAll('button')].find((each) => each.textContent === name)!;
    expect(document.activeElement).toBe(button('Try again'));
    await act(async () => button('Try again').click());
    expect(api.window.retryAfterCrashes).toHaveBeenCalledOnce();
    await act(async () => button('Close window').click());
    expect(api.window.command).toHaveBeenCalledWith('closeWindow');
  });
});

describe('App editing', () => {
  beforeAll(() => import('./App'), 30_000);

  afterEach(() => {
    act(() => roots.splice(0).forEach((root) => root.unmount()));
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  async function editing(text = '# hi') {
    // happy-dom can't follow CodeMirror's focus inside a shadow root; focusing for real is the e2e's.
    const { EditorView } = await import('@codemirror/view');
    vi.spyOn(EditorView.prototype, 'focus').mockImplementation(() => {});
    const content = { ...readyContent('markdown', 'rendered', text), path: '/d/a.md', version: 'v1' };
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await act(async () => events.editMode!({ id: 'doc-1', edit: 'granted' }));
    const editor = await vi.waitFor(() => {
      const element = shadow.querySelector<HTMLElement>('.cm-editor');
      expect(element?.querySelector('.cm-content')?.getAttribute('aria-readonly')).toBeNull();
      return EditorView.findFromDOM(element!)!;
    }, { timeout: 5_000 });
    const type = (insert: string) => act(() => editor.dispatch({ changes: { from: editor.state.doc.length, insert }, userEvent: 'input.type' }));
    const press = (key: string) => act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true })));
    const message = () => container.querySelector('[data-testid="status-message"]')?.textContent;
    const tab = () => container.querySelector('[role="tab"]')?.textContent ?? '';
    return { api, container, editor, type, press, message, tab };
  }

  const fill = (input: HTMLInputElement, value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

  it('finds and replaces with Ctrl+H while editing: Replace all says how many, and the tab is unsaved', async () => {
    const { container, editor, press, tab } = await editing('# hi hi');
    await press('h');
    await fill(container.querySelector<HTMLInputElement>('.find-bar input[aria-label="Find in document"]')!, 'hi');
    await fill(container.querySelector<HTMLInputElement>('.find-bar input[aria-label="Replace with"]')!, 'yo');
    const replaceAll = [...container.querySelectorAll('.find-bar button')].find((b) => b.textContent === 'Replace all') as HTMLButtonElement;
    await act(async () => replaceAll.click());
    expect(editor.state.doc.toString()).toBe('# yo yo');
    expect(container.querySelector('.find-bar [role="status"]')?.textContent).toBe('Replaced 2');
    await vi.waitFor(() => expect(tab()).toContain('unsaved changes'));
  });

  it('closes the replace row when edit mode ends, and keeps find open', async () => {
    const { container, press } = await editing();
    await press('h');
    expect(container.querySelector('.find-bar input[aria-label="Replace with"]')).not.toBeNull();
    await act(async () => events.editMode!({ id: 'doc-1', edit: 'leave' }));
    await vi.waitFor(() => expect(container.querySelector('.find-bar input[aria-label="Replace with"]')).toBeNull());
    expect(container.querySelector('.find-bar')).not.toBeNull();
  });

  it("opens no replace row outside edit mode, and says it's for edit mode", async () => {
    stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content: readyContent('markdown', 'rendered', '# hi') });
    const container = await renderApp();
    await documentShadow(container);
    await act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', ctrlKey: true, bubbles: true, cancelable: true })));
    expect(container.querySelector('.find-bar')).toBeNull();
    await vi.waitFor(() =>
      expect(container.querySelector('[data-testid="status-message"]')?.textContent).toBe('Find and replace works in edit mode (Ctrl+E)'),
    );
  });

  it("opens main's grant as an editable source view, and marks it in the tab and the status bar", async () => {
    const { container, tab } = await editing();
    expect(container.querySelector('[data-testid="status-mode"]')?.textContent).toBe('Editing');
    expect(tab()).toContain('edit mode');
    expect(tab()).not.toContain('unsaved changes');
  });

  it('marks unsaved changes, saves them with Ctrl+S naming the version loaded, and says Saved', async () => {
    const { api, type, press, message, tab } = await editing();
    type('!');
    await vi.waitFor(() => expect(tab()).toContain('unsaved changes'));
    expect(api.documents.dirty).toHaveBeenCalledWith('doc-1', true);

    api.documents.save.mockResolvedValueOnce({ kind: 'saved', version: 'v2' });
    await press('s');
    expect(api.documents.save).toHaveBeenCalledWith('doc-1', '# hi!', 'v1');
    await vi.waitFor(() => expect(message()).toBe('Saved'));
    expect(tab()).not.toContain('unsaved changes');
    expect(api.documents.dirty).toHaveBeenLastCalledWith('doc-1', false);

    // The next save names the version this one wrote.
    type('?');
    api.documents.save.mockResolvedValueOnce({ kind: 'saved', version: 'v3' });
    await press('s');
    expect(api.documents.save).toHaveBeenLastCalledWith('doc-1', '# hi!?', 'v2');
  });

  it("says why a save didn't write, and keeps the changes unsaved", async () => {
    const { api, type, press, message, tab } = await editing();
    type('!');
    const answers = [
      [{ kind: 'conflict', version: 'v9' }, 'Not saved: the file changed on disk'],
      [{ kind: 'conflict', version: null }, 'Not saved: the file is gone'],
      [{ kind: 'unencodable', character: '😀', line: 3 }, "Not saved: UTF-8 can't hold “😀” (line 3)"],
      [{ kind: 'failed', reason: 'no-permission' }, 'Not saved: no permission to write this file'],
    ] as const;
    for (const [result, text] of answers) {
      api.documents.save.mockResolvedValueOnce(result);
      await press('s');
      await vi.waitFor(() => expect(message()).toBe(text));
    }
    expect(tab()).toContain('unsaved changes');
  });

  const bar = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-testid="document-banner"][data-banner^="disk-"]');
  const barButtons = (container: HTMLElement) => [...(bar(container)?.querySelectorAll('button') ?? [])].map((button) => button.textContent);
  const clickBar = (container: HTMLElement, name: string) =>
    act(async () => [...bar(container)!.querySelectorAll('button')].find((button) => button.textContent === name)!.click());
  async function changeOnDisk(api: ReturnType<typeof stubBridge>, content: DocumentContent) {
    const reads = api.documents.read.mock.calls.length;
    api.documents.read.mockResolvedValue(content);
    await act(async () => events.stale!('doc-1'));
    await vi.waitFor(() => expect(api.documents.read).toHaveBeenCalledTimes(reads + 1));
    await act(async () => {});
  }
  const theirs = { ...readyContent('markdown', 'rendered', 'theirs'), path: '/d/a.md', version: 'v5' };

  it('keeps unsaved text when the file changes on disk, says so, and saves over it only after Keep mine', async () => {
    const { api, container, editor, type, press, message } = await editing();
    type('!');
    await changeOnDisk(api, theirs);
    expect(editor.state.doc.toString()).toBe('# hi!');
    expect(bar(container)?.textContent).toContain('File changed on disk');
    expect(barButtons(container)).toEqual(['Show diff', 'Keep mine', 'Load theirs']);

    await press('s');
    expect(api.documents.save).not.toHaveBeenCalled();
    expect(message()).toBe('Not saved: the file changed on disk. Keep mine or load theirs first');

    await clickBar(container, 'Keep mine');
    expect(bar(container)).toBeNull();
    api.documents.save.mockResolvedValueOnce({ kind: 'saved', version: 'v6' });
    await press('s');
    expect(api.documents.save).toHaveBeenCalledWith('doc-1', '# hi!', 'v5');
  });

  it('shows mine against theirs, read-only, on Show diff, and the choice from there closes it', async () => {
    const { EditorView } = await import('@codemirror/view');
    const { api, container, editor, type } = await editing();
    type('!');
    await changeOnDisk(api, theirs);
    expect(barButtons(container)).toEqual(['Show diff', 'Keep mine', 'Load theirs']);
    await clickBar(container, 'Show diff');
    const diff = await vi.waitFor(() => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Changes: mine | theirs"]');
      expect(dialog?.querySelectorAll('.cm-editor')).toHaveLength(2);
      return dialog!;
    }, { timeout: 5_000 });
    const [mine, disk] = [...diff.querySelectorAll<HTMLElement>('.cm-editor')].map((element) => EditorView.findFromDOM(element)!);
    expect(mine!.state.doc.toString()).toBe('# hi!');
    expect(disk!.state.doc.toString()).toBe('theirs');
    expect(mine!.state.readOnly && disk!.state.readOnly).toBe(true);

    await act(async () => [...diff.querySelectorAll('button')].find((button) => button.textContent === 'Load theirs')!.click());
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    expect(editor.state.doc.toString()).toBe('theirs');
  });

  it('takes their text on Load theirs: clean, still editing', async () => {
    const { api, container, editor, type, tab } = await editing();
    type('!');
    await changeOnDisk(api, theirs);
    await clickBar(container, 'Load theirs');
    expect(editor.state.doc.toString()).toBe('theirs');
    expect(bar(container)).toBeNull();
    await vi.waitFor(() => expect(tab()).not.toContain('unsaved changes'));
    expect(container.querySelector('[data-testid="status-mode"]')?.textContent).toBe('Editing');
  });

  it('keeps the editor and its text when the file is deleted, and Save again writes it back', async () => {
    const { api, container, editor, type, press, message, tab } = await editing();
    type('!');
    await changeOnDisk(api, { state: 'missing', path: '/d/a.md' });
    expect(container.querySelector('[data-testid="document-state"]')).toBeNull();
    expect(editor.state.doc.toString()).toBe('# hi!');
    expect(bar(container)?.textContent).toContain('File deleted on disk');
    expect(barButtons(container)).toEqual(['Keep mine', 'Save again']);

    api.documents.save.mockResolvedValueOnce({ kind: 'saved', version: 'v6' });
    await clickBar(container, 'Save again');
    expect(api.documents.save).toHaveBeenCalledWith('doc-1', '# hi!', null);
    await vi.waitFor(() => expect(message()).toBe('Saved'));
    expect(bar(container)).toBeNull();
    expect(tab()).not.toContain('unsaved changes');

    // Saved again, it is the version a later save names; nothing new was read.
    type('?');
    await press('s');
    expect(api.documents.save).toHaveBeenLastCalledWith('doc-1', '# hi!?', 'v6');
  });

  it('after Keep mine on a deleted file, Ctrl+S writes it back', async () => {
    const { api, container, type, press } = await editing();
    type('!');
    await changeOnDisk(api, { state: 'missing', path: '/d/a.md' });
    await clickBar(container, 'Keep mine');
    expect(bar(container)).toBeNull();
    await press('s');
    expect(api.documents.save).toHaveBeenCalledWith('doc-1', '# hi!', null);
  });

  it("keeps the editor when the file turns into something it can't show, and Load theirs shows that", async () => {
    const { api, container, editor, type } = await editing();
    type('!');
    await changeOnDisk(api, { state: 'binary', path: '/d/a.md', size: 10 });
    expect(editor.state.doc.toString()).toBe('# hi!');
    expect(bar(container)?.textContent).toContain("can't be shown as text");
    expect(barButtons(container)).toEqual(['Load theirs']);
    await clickBar(container, 'Load theirs');
    await vi.waitFor(() => expect(container.querySelector('[data-testid="document-state"]')?.getAttribute('data-state')).toBe('binary'));
    expect(api.documents.leaveEdit).toHaveBeenCalledWith('doc-1');
  });

  it("shows no bar for the app's own save: typing after it is just unsaved", async () => {
    const { api, container, type, press } = await editing();
    type('!');
    api.documents.save.mockResolvedValueOnce({ kind: 'saved', version: 'v2' });
    await press('s');
    type('?');
    await act(async () => {});
    expect(bar(container)).toBeNull();
  });

  it('reads the file again when a save meets a change not seen yet, so the bar can offer the choice', async () => {
    const { api, container, type, press } = await editing();
    type('!');
    api.documents.read.mockResolvedValue(theirs);
    api.documents.save.mockResolvedValueOnce({ kind: 'conflict', version: 'v5' });
    await press('s');
    await vi.waitFor(() => expect(bar(container)?.textContent).toContain('File changed on disk'));
  });

  it('takes a change on disk into the editor while nothing is unsaved', async () => {
    const { api, editor } = await editing();
    api.documents.read.mockResolvedValue({ ...readyContent('markdown', 'rendered', 'theirs'), path: '/d/a.md', version: 'v5' });
    await act(async () => events.stale!('doc-1'));
    await vi.waitFor(() => expect(editor.state.doc.toString()).toBe('theirs'));
  });

  it('hands main its unsaved text a moment after typing stops, for a crash', async () => {
    const { api, type } = await editing();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      type('!');
      type('?');
      expect(api.documents.keep).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1000));
      expect(api.documents.keep).toHaveBeenCalledOnce();
      expect(api.documents.keep).toHaveBeenCalledWith('doc-1', '# hi!?', 'v1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('hands main its unsaved text at once when the tab is about to move to another window (ADR-019)', async () => {
    const { api, type } = await editing();
    const { editors } = await import('./edit/editors');
    type('!');
    expect(api.documents.keep).not.toHaveBeenCalled();
    act(() => editors.get('doc-1')!.keepNow());
    expect(api.documents.keep).toHaveBeenCalledWith('doc-1', '# hi!', 'v1');
  });

  it('arrives editable, with nothing unsaved, when main says the tab is in edit mode (moved in, ADR-019)', async () => {
    const { EditorView } = await import('@codemirror/view');
    vi.spyOn(EditorView.prototype, 'focus').mockImplementation(() => {});
    const content = { ...readyContent('markdown', 'rendered', '# on disk'), path: '/d/a.md', version: 'v2' };
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content });
    api.documents.recover.mockResolvedValue({ edit: true, kept: null });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    const editor = await vi.waitFor(() => {
      const element = shadow.querySelector<HTMLElement>('.cm-editor');
      expect(element?.querySelector('.cm-content')?.getAttribute('aria-readonly')).toBeNull();
      return EditorView.findFromDOM(element!)!;
    }, { timeout: 5_000 });
    expect(editor.state.doc.toString()).toBe('# on disk');
    expect(container.querySelector('[role="tab"]')?.textContent).toContain('edit mode');
    expect(container.querySelector('[role="tab"]')?.textContent).not.toContain('unsaved changes');
  });

  it('comes back after a crash in edit mode with the unsaved text main kept, against its version', async () => {
    const { EditorView } = await import('@codemirror/view');
    vi.spyOn(EditorView.prototype, 'focus').mockImplementation(() => {});
    const content = { ...readyContent('markdown', 'rendered', '# on disk'), path: '/d/a.md', version: 'v2' };
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content });
    api.documents.recover.mockResolvedValue({ edit: true, kept: { text: '# mine', base: 'v1' } });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    const editor = await vi.waitFor(() => {
      const element = shadow.querySelector<HTMLElement>('.cm-editor');
      expect(element?.querySelector('.cm-content')?.getAttribute('aria-readonly')).toBeNull();
      return EditorView.findFromDOM(element!)!;
    }, { timeout: 5_000 });
    expect(editor.state.doc.toString()).toBe('# mine');
    expect(container.querySelector('[role="tab"]')?.textContent).toContain('unsaved changes');
    // The file moved on since the text was loaded: the bar asks before anything is written.
    await vi.waitFor(() => expect(bar(container)?.textContent).toContain('File changed on disk'));
    await clickBar(container, 'Keep mine');
    await act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })));
    expect(api.documents.save).toHaveBeenCalledWith('doc-1', '# mine', 'v2');
  });

  const dialog = () => document.querySelector<HTMLElement>('[data-testid="unsaved-dialog"]');
  const choose = async (name: string) => {
    const button = await vi.waitFor(() => [...dialog()!.querySelectorAll('button')].find((each) => each.textContent === name)!);
    await act(async () => button.click());
  };

  it("says a file can't be edited when main refuses edit mode, and stays read-only", async () => {
    const content = { ...readyContent('markdown', 'rendered', '# hi'), path: '/d/a.md', version: 'v1' };
    const api = stubBridge({}, { records: [{ id: 'doc-1', path: '/d/a.md' }], content });
    const container = await renderApp();
    const shadow = await documentShadow(container);
    await act(async () => events.editMode!({ id: 'doc-1', edit: 'refused' }));
    await vi.waitFor(() => expect(container.querySelector('[data-testid="status-message"]')?.textContent).toBe("This file can't be edited"));
    expect(shadow.querySelector('.cm-content[aria-readonly="true"], article')).not.toBeNull();
    expect(container.querySelector('.tab-indicator[data-indicator="edit mode"]')).toBeNull();
    expect(api.documents.leaveEdit).not.toHaveBeenCalled();
  });

  it('leaves edit mode at once when nothing is unsaved', async () => {
    const { api, container } = await editing();
    await act(async () => events.editMode!({ id: 'doc-1', edit: 'leave' }));
    expect(api.documents.leaveEdit).toHaveBeenCalledWith('doc-1');
    expect(container.querySelector('[data-testid="status-mode"]')?.textContent).toBe('Read-only');
    expect(dialog()).toBeNull();
  });

  it("asks before leaving edit mode with unsaved changes: Cancel stays, Don't save drops them, Save keeps them", async () => {
    const { api, editor, container, type } = await editing();
    type('!');
    await act(async () => events.editMode!({ id: 'doc-1', edit: 'leave' }));
    await vi.waitFor(() => expect(dialog()?.textContent).toContain('Save changes to a.md?'));
    await choose('Cancel');
    expect(api.documents.leaveEdit).not.toHaveBeenCalled();
    expect(editor.state.doc.toString()).toBe('# hi!');

    await act(async () => events.editMode!({ id: 'doc-1', edit: 'leave' }));
    await choose("Don't save");
    await vi.waitFor(() => expect(api.documents.leaveEdit).toHaveBeenCalledWith('doc-1'));
    expect(editor.state.doc.toString()).toBe('# hi');
    expect(container.querySelector('[data-testid="status-mode"]')?.textContent).toBe('Read-only');
  });

  it('saves on Save before leaving edit mode, and stays when the save fails', async () => {
    const { api, type } = await editing();
    type('!');
    api.documents.save.mockResolvedValueOnce({ kind: 'conflict', version: 'v9' });
    await act(async () => events.editMode!({ id: 'doc-1', edit: 'leave' }));
    await choose('Save');
    await vi.waitFor(() => expect(api.documents.save).toHaveBeenCalledOnce());
    expect(api.documents.leaveEdit).not.toHaveBeenCalled();

    api.documents.save.mockResolvedValueOnce({ kind: 'saved', version: 'v2' });
    await act(async () => events.editMode!({ id: 'doc-1', edit: 'leave' }));
    await choose('Save');
    await vi.waitFor(() => expect(api.documents.leaveEdit).toHaveBeenCalledWith('doc-1'));
    expect(api.documents.save).toHaveBeenLastCalledWith('doc-1', '# hi!', 'v1');
  });

  it('asks before closing a tab with unsaved changes, and closes it only once agreed', async () => {
    const { api, type, press } = await editing();
    type('!');
    await vi.waitFor(() => expect(api.documents.dirty).toHaveBeenCalledWith('doc-1', true));
    await press('w');
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    await choose('Cancel');
    expect(api.tabs.close).not.toHaveBeenCalled();
    await press('w');
    await choose("Don't save");
    await vi.waitFor(() => expect(api.tabs.close).toHaveBeenCalledWith('doc-1'));
  });

  it("answers main's question before a close: asking at once, then the reader's choice", async () => {
    const { api, type } = await editing();
    type('!');
    await act(async () => events.confirmClose!(['doc-1']));
    expect(api.documents.closeAnswer).toHaveBeenCalledWith('asking');
    await choose('Cancel');
    await vi.waitFor(() => expect(api.documents.closeAnswer).toHaveBeenLastCalledWith('cancel'));

    api.documents.save.mockResolvedValueOnce({ kind: 'saved', version: 'v2' });
    await act(async () => events.confirmClose!(['doc-1']));
    await choose('Save');
    await vi.waitFor(() => expect(api.documents.closeAnswer).toHaveBeenLastCalledWith('proceed'));
  });
});
