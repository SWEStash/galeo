import type { QuickOpenEntry, QuickOpenResults, QuickOpenSection, QuickOpenStart } from '../../shared/quick-open';
import { fileName, folderOf, joinPath } from '../../shared/paths';
import type { SelectionGrants } from '../documents/selections';
import { FsError, type Clock, type FileSystem } from '../ports';
import { findGitRoot } from './git-root';
import { indexPaths, matchPath, topMatches, type PathIndex } from './matcher';
import { walk } from './walker';

/** How many entries a section shows. */
const SHOWN = { tabs: 50, recentEmpty: 8, recent: 20, repo: 50, path: 50 } as const;

export interface QuickOpenDeps {
  fs: Pick<FileSystem, 'readDir' | 'stat'>;
  clock: Clock;
  grants: SelectionGrants;
  /** The home folder: `~/` in typed paths, and how folders are shown. */
  home: string;
  /** New results for a query already answered: the repository walk found more. */
  onUpdate: (window: number, results: QuickOpenResults) => void;
}

export interface QuickOpenRequest {
  /** The file the window shows, whose repository (else folder) is searched; null for none. */
  active: string | null;
  /** A folder to search instead (dropped on the window). */
  folder?: string;
  /** The window's open files, and the profile's recent files, newest first. */
  tabs: readonly string[];
  recent: readonly string[];
  /** Names the settings add to the built-in exclusions. */
  exclude: readonly string[];
}

interface Session {
  token: string;
  request: QuickOpenRequest;
  root: string | null;
  scope: string | null;
  files: string[];
  index: PathIndex | null;
  walking: boolean;
  truncated: boolean;
  query: string | null;
  walk: Promise<void>;
  closed: boolean;
}

/**
 * Quick open for each window (UX F8): open tabs and recent files at once, the repository of the
 * shown file as its walk streams in, or a typed `~/…` or `/…` folder. Main walks and matches;
 * the page gets opaque ids for the files it may open, only from the last results (ADR-004).
 * Nothing is kept once it closes (PRD: no index is persisted).
 */
export class QuickOpen {
  private readonly sessions = new Map<number, Session>();
  private tokens = 0;

  constructor(private readonly deps: QuickOpenDeps) {}

  async start(window: number, request: QuickOpenRequest): Promise<QuickOpenStart> {
    this.close(window);
    const token = `${window}:${++this.tokens}`;
    const folder = request.folder ?? (request.active === null ? null : folderOf(request.active));
    const gitRoot = folder === null || folder === '' ? null : await findGitRoot(this.deps.fs, folder);
    const root = gitRoot ?? (folder || null);
    const scope = root === null ? null : gitRoot ? `${fileName(root)} (git root)` : fileName(root);
    const session: Session = { token, request, root, scope, files: [], index: null, walking: root !== null, truncated: false, query: null, walk: Promise.resolve(), closed: false };
    this.sessions.set(window, session);
    if (root !== null) session.walk = this.walk(window, session, root);
    return { token, scope };
  }

  /** Resolves once the session's repository walk has finished. */
  walked(token: string): Promise<void> {
    for (const session of this.sessions.values()) if (session.token === token) return session.walk;
    return Promise.resolve();
  }

  async query(window: number, token: string, query: string): Promise<QuickOpenResults> {
    const session = this.sessions.get(window);
    if (!session || session.token !== token) return { token, query, sections: [] };
    session.query = query;
    const typed = this.typedFolder(query);
    const sections = typed ? [await this.pathSection(typed.folder, typed.filter, typed.shown)] : this.sections(session, query);
    return this.offer(window, session, query, sections);
  }

  choose(window: number, token: string, id: string): string | null {
    const session = this.sessions.get(window);
    if (!session || session.token !== token) return null;
    return this.deps.grants.choose(window, 'quick-open', id);
  }

  /** Closes the window's quick open (a token, when given, must be the open one's). */
  close(window: number, token?: string): void {
    const session = this.sessions.get(window);
    if (!session || (token !== undefined && session.token !== token)) return;
    session.closed = true;
    this.sessions.delete(window);
    this.deps.grants.offer(window, 'quick-open', []);
  }

  private async walk(window: number, session: Session, root: string): Promise<void> {
    const walker = walk(this.deps.fs, root, { clock: this.deps.clock, exclude: session.request.exclude });
    try {
      for (let step = await walker.next(); ; step = await walker.next()) {
        if (session.closed) return;
        if (step.done) {
          session.truncated = step.value.truncated !== null;
          break;
        }
        session.files.push(...step.value);
        session.index = indexPaths(session.files);
        this.update(window, session);
      }
    } catch (error) {
      if (!(error instanceof FsError)) throw error;
    }
    session.walking = false;
    this.update(window, session);
  }

  private update(window: number, session: Session): void {
    if (session.closed || !session.query || this.typedFolder(session.query)) return;
    const sections = this.sections(session, session.query);
    this.deps.onUpdate(window, this.offer(window, session, session.query, sections));
  }

  private sections(session: Session, query: string): QuickOpenSection[] {
    const { tabs, recent } = session.request;
    const tabSet = new Set(tabs);
    const recentFiles = recent.filter((path) => !tabSet.has(path));
    const listed = new Set([...tabs, ...recentFiles]);
    // Tabs and recent files match as the reader sees them (`~/…`).
    const pick = (paths: readonly string[], limit: number) => {
      if (!query) return paths.slice(0, limit);
      const byShown = new Map(paths.map((path) => [this.shown(path), path]));
      return topMatches(query, [...byShown.keys()], limit).map((match) => byShown.get(match.path)!);
    };
    const sections: QuickOpenSection[] = [
      { kind: 'tabs', title: 'Open tabs', entries: pick(tabs, SHOWN.tabs).map((path) => this.fileEntry(path)) },
      { kind: 'recent', title: 'Recent', entries: pick(recentFiles, query ? SHOWN.recent : SHOWN.recentEmpty).map((path) => this.fileEntry(path)) },
    ];
    if (query && session.root !== null && session.scope !== null) {
      const root = session.root;
      const matches = session.index ? topMatches(query, session.index, SHOWN.repo + listed.size) : [];
      const entries = matches
        .map((match) => ({ relative: match.path, path: joinPath(root, ...match.path.split('/')) }))
        .filter(({ path }) => !listed.has(path))
        .slice(0, SHOWN.repo)
        .map(({ relative, path }) => ({ id: '', name: relative, detail: '', path }));
      sections.push({ kind: 'repo', title: `In ${session.scope}`, entries, walking: session.walking, ...(session.truncated ? { truncated: true } : {}) });
    }
    return sections.filter((section) => section.kind === 'repo' || section.entries.length > 0);
  }

  private fileEntry(path: string): QuickOpenEntry {
    return { id: '', name: fileName(path), detail: this.shown(folderOf(path)), path };
  }

  /** `~/…` under the home folder; other paths as they are. */
  private shown(path: string): string {
    const { home } = this.deps;
    return path === home ? '~' : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
  }

  private typedFolder(query: string): { folder: string; filter: string; shown: string } | null {
    if (!query.startsWith('~/') && !query.startsWith('/')) return null;
    const slash = query.lastIndexOf('/');
    const shown = query.slice(0, slash + 1);
    const folder = shown.startsWith('~/') ? joinPath(this.deps.home, shown.slice(2, -1)).replace(/\/$/, '') : shown.slice(0, -1) || '/';
    return { folder, filter: query.slice(slash + 1), shown };
  }

  private async pathSection(folder: string, filter: string, shown: string): Promise<QuickOpenSection> {
    const entries: { name: string; path: string; folder: boolean }[] = [];
    try {
      for await (const entry of this.deps.fs.readDir(folder)) {
        const path = joinPath(folder === '/' ? '' : folder, entry.name);
        let kind = entry.kind;
        if (kind === 'symlink') kind = await this.deps.fs.stat(path).then((stat) => stat.kind, () => 'other' as const);
        if (kind === 'file' || kind === 'directory') entries.push({ name: entry.name, path, folder: kind === 'directory' });
      }
    } catch (error) {
      if (!(error instanceof FsError)) throw error;
    }
    const matched = filter
      ? entries.flatMap((entry) => {
          const match = matchPath(filter, entry.name);
          return match ? [{ entry, score: match.score }] : [];
        }).sort((a, b) => b.score - a.score).map(({ entry }) => entry)
      : entries.sort((a, b) => a.name.localeCompare(b.name));
    return {
      kind: 'path',
      title: 'Files',
      entries: matched.slice(0, SHOWN.path).map((entry) =>
        entry.folder
          ? { id: `folder:${entry.path}`, name: `${entry.name}/`, detail: '', folder: true as const, path: `${shown}${entry.name}/` }
          : { id: '', name: entry.name, detail: '', path: entry.path },
      ),
    };
  }

  /** Offers the files the results list, and gives each its id; folders aren't offered. */
  private offer(window: number, session: Session, query: string, sections: QuickOpenSection[]): QuickOpenResults {
    const files = sections.flatMap((section) => section.entries.filter((entry) => !entry.folder).map((entry) => entry.path!));
    const ids = new Map(this.deps.grants.offer(window, 'quick-open', [...new Set(files)]).map(({ id, path }) => [path, id]));
    return {
      token: session.token,
      query,
      sections: sections.map((section) => ({
        ...section,
        entries: section.entries.map((entry) => {
          if (entry.folder) return entry;
          const { path: _path, ...rest } = entry;
          return { ...rest, id: ids.get(entry.path!)! };
        }),
      })),
    };
  }
}
