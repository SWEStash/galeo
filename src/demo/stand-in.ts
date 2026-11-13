import { EditGrants } from '../core/documents/edit-grants';
import { editToggle } from '../core/documents/edit-toggle';
import { findInBytesTask, TabSearches } from '../core/documents/find-all';
import { readDocument } from '../core/documents/read';
import { saveDocument } from '../core/documents/save';
import { toggleTaskBox } from '../core/documents/task-boxes';
import type { TaskRunner } from '../core/ports';
import { detectFormat } from '../core/formats/registry';
import { forPage } from '../core/tabs/page';
import { TabRegistry } from '../core/tabs/registry';
import { searchTabs } from '../core/tabs/search';
import type { Decode } from '../core/text/decode';
import { buildApi, type Subscribe } from '../shared/contracts/api';
import type { Channel, EventName, Events, GaleoApi, Requests, Responses, StartInfo } from '../shared/contracts/ipc';
import { UNKNOWN_DOCUMENT } from '../shared/documents';
import { findInTextTask } from '../shared/find';
import { workerFormat } from '../shared/formats';
import { commandFor, type KeyEventLike } from '../shared/keymap';
import { referencesTask } from '../shared/markdown/references';
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings';
import type { MemoryFiles } from './memory-fs';

/** The demo's one window, as main numbers windows. */
const WINDOW = 1;
/** The demo's home folder: tabs show their folders under it as `~/…`. */
export const DEMO_HOME = '/home/demo';

const START: StartInfo = {
  name: 'galeo',
  version: 'demo',
  platform: 'linux',
  sandboxed: true,
  sandboxUnavailable: null,
  commandLauncher: false,
};

const decode: Decode = (bytes, encoding, { fatal }) => new TextDecoder(encoding, { fatal, ignoreBOM: true }).decode(bytes);

/** Not a security hash: the demo's versions only tell its own in-memory texts apart (FNV-1a, 32 bits). */
function hash(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (const byte of bytes) h = Math.imul(h ^ byte, 0x01000193);
  return `${bytes.byteLength}-${(h >>> 0).toString(16)}`;
}

/** Main's worker tasks, run in the page: the demo's texts are small and the reader's own. */
const TASKS: Record<string, (input: unknown) => unknown> = {
  references: referencesTask,
  findInText: findInTextTask,
  findInBytes: (input) => findInBytesTask(input, decode),
};
const tasks: TaskRunner = {
  run: async <T,>(task: string, input: unknown) => {
    try {
      return { ok: true as const, value: TASKS[task]!(input) as T };
    } catch (error) {
      return { ok: false as const, reason: 'error' as const, message: String(error) };
    }
  },
};

type Handlers = { [C in Channel]: (...args: Requests[C]) => Responses[C] | Promise<Responses[C]> };

/** What the demo can't do, as the app's own refusals say it. */
const NOT_IN_DEMO = 'not in the demo';

/**
 * `window.galeo` for the website's demo (#41): the app's own API (`buildApi`), answered in the page by main's
 * core logic (tabs, reads, saves, edit grants, tab search, find in all tabs) over `files`, an in-memory file
 * system. Nothing reads the reader's files, opens a window or talks to a network. `keyDown` takes the keys main
 * catches before the page in the app (Ctrl+E).
 */
export function standIn(files: MemoryFiles, open: readonly string[]): { api: GaleoApi; keyDown: (event: KeyEventLike) => boolean; changed: (path: string) => void } {
  const listeners = new Map<EventName, Set<(payload: never) => void>>();
  const emit = <E extends EventName>(event: E, payload: Events[E]) => {
    for (const listener of listeners.get(event) ?? []) (listener as (payload: Events[E]) => void)(payload);
  };
  const subscribe: Subscribe = (event, listener) => {
    const set = listeners.get(event) ?? new Set();
    listeners.set(event, set.add(listener));
    return () => void set.delete(listener);
  };

  let ids = 0;
  const tabs = new TabRegistry(
    () => `demo-${++ids}`,
    () => queueMicrotask(() => emit('tabs.changed', snapshot())),
  );
  const snapshot = () => forPage(tabs.snapshot(WINDOW), DEMO_HOME);
  const grants = new EditGrants();
  const searches = new TabSearches({ records: tabs, grants, fs: files, tasks });
  const shown = new Map<string, boolean>();
  for (const path of open) tabs.open(path, WINDOW);
  const first = tabs.list(WINDOW)[0];
  if (first) tabs.activate(first.id, WINDOW);

  let overrides: Partial<Settings> = {};
  const settingsState = () => {
    const settings = { ...DEFAULT_SETTINGS, ...overrides };
    const sources = Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((key) => [key, key in overrides ? 'global' : 'default'])) as Responses['settings.get']['sources'];
    return { settings, notices: [], session: null, css: { global: '', profile: '' }, shared: settings, sources };
  };
  const settingsChanged = () => emit('settings.changed', settingsState());

  const document = (id: string) => {
    const record = tabs.get(id, WINDOW);
    if (!record || record.kind === 'settings') throw new Error(UNKNOWN_DOCUMENT);
    return record;
  };
  const read = async (id: string) => {
    const record = document(id);
    const content = await readDocument(record.path, { fs: files, decode, hash, encoding: tabs.encoding(id, WINDOW) ?? undefined });
    shown.set(id, content.state === 'ready');
    return content;
  };

  const handlers: Handlers = {
    'app.info': () => ({ ...START, crashLoop: false }),
    'app.resolveSandboxUnavailable': () => {},
    'app.installLauncher': () => ({ ok: false, reason: NOT_IN_DEMO }),
    'app.uninstallLauncher': () => ({ removed: [], kept: [] }),
    'app.installProfileLauncher': () => ({ ok: false, reason: NOT_IN_DEMO }),
    'app.uninstallProfileLauncher': () => ({ removed: [], kept: [] }),

    'documents.read': (id) => read(id),
    'documents.setEncoding': (id, encoding) => {
      if (!tabs.setEncoding(id, WINDOW, encoding)) throw new Error(UNKNOWN_DOCUMENT);
    },
    'documents.followLink': () => ({ kind: 'refused', reason: 'unavailable' }),
    'documents.back': () => ({ kind: 'none' }),
    'documents.forward': () => ({ kind: 'none' }),
    'documents.resolveImage': () => ({ kind: 'refused', reason: 'unavailable' }),
    'documents.toggleTask': async (id, line, base) => {
      const record = document(id);
      if (grants.allows(id, WINDOW, record.path)) return { kind: 'refused', reason: 'editing' };
      const format = workerFormat(detectFormat(record.path));
      if (!format) return { kind: 'refused', reason: 'not-a-task' };
      return toggleTaskBox(
        { fs: files, decode, hash, references: async (text, of) => referencesTask({ text, format: of }) },
        { path: record.path, line, base, encoding: tabs.encoding(id, WINDOW) ?? undefined, format },
      );
    },
    'documents.missingLinks': () => [],
    'documents.pathMenu': () => {},
    'documents.contextMenu': () => null,
    'documents.save': async (id, text, base) => {
      const record = document(id);
      if (!grants.allows(id, WINDOW, record.path)) return { kind: 'refused', reason: 'not-editable' };
      return saveDocument({ fs: files, decode, hash }, { path: record.path, text, base, encoding: tabs.encoding(id, WINDOW) ?? undefined });
    },
    'documents.exportPdf': () => null,
    'documents.printPdf': () => 'refused',
    'diagrams.save': () => null,
    'diagrams.write': () => 'refused',
    'documents.dirty': (id, dirty) => grants.setDirty(id, WINDOW, dirty),
    'documents.leaveEdit': (id) => grants.revoke(id, WINDOW),
    'documents.closeAnswer': () => {},
    'documents.keep': (id, text, base) => grants.keep(id, WINDOW, text, base),
    'documents.recover': (id) => ({ edit: grants.granted(id, WINDOW), kept: grants.kept(id, WINDOW) }),
    'documents.findAll': (query, options) => searches.search(WINDOW, query, options),

    'tabs.snapshot': () => snapshot(),
    'tabs.activated': (id) => void tabs.activate(id, WINDOW),
    'tabs.rendering': () => {},
    'tabs.rendered': () => {},
    'tabs.renderAgain': (id) => void tabs.clearCrashed(id, WINDOW),
    'tabs.position': (id, position) => void tabs.setPosition(id, WINDOW, position),
    'tabs.viewState': (id, state) => void tabs.setViewState(id, WINDOW, state),
    'tabs.zoom': (id, zoom) => void tabs.setZoom(id, WINDOW, zoom),
    'tabs.width': (id, width) => void tabs.setWidth(id, WINDOW, width),
    'tabs.pin': (id, pinned) => void tabs.setPinned(id, WINDOW, pinned),
    'tabs.menu': () => null,
    'tabs.close': (id) => {
      if (tabs.close(id, WINDOW)) grants.revoke(id, WINDOW);
    },
    'tabs.reopenClosed': () => tabs.reopenClosed(WINDOW)?.id ?? null,
    'tabs.search': (query) => searchTabs(query, tabs.list(WINDOW).filter((tab) => tab.kind !== 'settings'), tabs.closedList(WINDOW), DEMO_HOME),
    'tabs.reopenClosedTab': (id) => tabs.reopenClosedById(WINDOW, id)?.id ?? null,
    'tabs.move': (id, position) => void tabs.move(id, WINDOW, position),
    'tabs.dragStart': (id) => {
      const tab = tabs.get(id, WINDOW);
      return tab !== undefined && tab.kind !== 'settings';
    },
    'tabs.dragEnd': () => {},
    'tabs.adopt': () => null,
    'tabs.moveTo': () => false,
    'tabs.windows': () => [],
    'tabs.openSettings': () => tabs.openSettings(WINDOW).id,

    'settings.get': () => settingsState(),
    'settings.set': (_scope, change) => {
      overrides = { ...overrides, ...change };
      settingsChanged();
      return { ok: true };
    },
    'settings.reset': (key) => {
      const { [key]: _gone, ...rest } = overrides;
      overrides = rest;
      settingsChanged();
      return { ok: true };
    },
    'settings.fonts': () => [],
    'settings.openCustomCss': () => {},
    'settings.openNoticeFile': () => {},
    'session.previous': () => [],
    'session.restorePrevious': () => {},
    'recent.list': () => [],
    'recent.open': () => {},
    'recent.clear': () => {},
    'drops.open': () => ({ folder: false }),
    'quickOpen.start': () => ({ token: 'demo', scope: null }),
    'quickOpen.query': (token, query) => ({ token, query, sections: [] }),
    'quickOpen.open': () => {},
    'quickOpen.close': () => {},
    'watch.choose': () => {},
    'watch.stop': () => {},
    'watch.open': () => {},
    'watch.openAllNew': () => {},
    'watch.state': () => null,
    'watch.panel': () => {},
    'profiles.created': () => null,
    'profiles.undoCreate': () => {},
    'profiles.list': () => ({ current: 'default', profiles: [{ id: 'default', name: 'default', accent: null, running: true }] }),
    'profiles.open': () => {},
    'profiles.create': () => ({ ok: false, reason: 'invalid-file' }),
    'profiles.update': () => ({ ok: false, reason: 'invalid-file' }),
    'profiles.delete': () => {},
    'window.command': () => {},
    'window.retryAfterCrashes': () => {
      throw new Error('not showing the crash loop');
    },
    'window.pageFailed': () => {},
  };

  const invoke = async (channel: Channel, args: unknown[]) => (handlers[channel] as (...args: unknown[]) => unknown)(...args);

  /** Ctrl+E on the shown tab, as main does it (ADR-015); the demo's files are the reader's to edit. */
  const keyDown = (event: KeyEventLike) => {
    if (commandFor(event, START.platform) !== 'editMode') return false;
    const { active } = tabs.snapshot(WINDOW);
    const tab = active ? tabs.get(active, WINDOW) : undefined;
    if (!tab || tab.kind === 'settings') return true;
    const toggle = editToggle({ granted: grants.allows(tab.id, WINDOW, tab.path), text: shown.get(tab.id) === true, chosen: true });
    if (toggle === 'grant') grants.grant(tab.id, WINDOW, tab.path);
    emit('documents.editMode', { id: tab.id, edit: toggle === 'grant' ? 'granted' : toggle === 'leave' ? 'leave' : 'refused' });
    return true;
  };

  /** A file changed (a log grew): each tab showing it reads it again. */
  const changed = (path: string) => {
    for (const tab of tabs.list(WINDOW)) if (tab.path === path) emit('tabs.stale', tab.id);
  };

  return { api: buildApi(invoke, subscribe, START), keyDown, changed };
}
