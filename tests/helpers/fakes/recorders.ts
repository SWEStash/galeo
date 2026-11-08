import {
  FsError,
  type AppPaths,
  type FileWatcher,
  type FolderEvent,
  type FolderWatcher,
  type InstanceChannel,
  type OpenRequest,
  type OsShell,
  type SystemMetrics,
  type Unsubscribe,
  type WatchEvent,
} from '../../../src/core/ports';

/** A listener set with an `emit` for tests to drive events. */
class Emitter<Args extends unknown[]> {
  private readonly listeners = new Set<(...args: Args) => void>();

  on(listener: (...args: Args) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(...args: Args): void {
    for (const listener of [...this.listeners]) listener(...args);
  }

  get size(): number {
    return this.listeners.size;
  }
}

export class FakeFileWatcher implements FileWatcher, FolderWatcher {
  private readonly emitters = new Map<string, Emitter<[WatchEvent]>>();
  private readonly folders = new Map<string, Emitter<[FolderEvent]>>();
  /** Folders whose watch throws, as past the system's watch limit. */
  readonly unwatchable = new Set<string>();

  watchFolder(folder: string, listener: (event: FolderEvent) => void): Unsubscribe {
    if (this.unwatchable.has(folder)) throw new FsError('EOTHER', folder);
    const emitter = this.folders.get(folder) ?? new Emitter<[FolderEvent]>();
    this.folders.set(folder, emitter);
    const off = emitter.on(listener);
    return () => {
      off();
      if (emitter.size === 0) this.folders.delete(folder);
    };
  }

  /** The folders watched now. */
  watchedFolders(): string[] {
    return [...this.folders.keys()].sort();
  }

  emitFolder(folder: string, event: FolderEvent): void {
    this.folders.get(folder)?.emit(event);
  }

  watch(path: string, listener: (event: WatchEvent) => void): Unsubscribe {
    const emitter = this.emitters.get(path) ?? new Emitter<[WatchEvent]>();
    this.emitters.set(path, emitter);
    return emitter.on(listener);
  }

  emit(event: WatchEvent): void {
    this.emitters.get(event.path)?.emit(event);
  }
}

export class FakeInstanceChannel implements InstanceChannel {
  private readonly requests = new Emitter<[OpenRequest]>();

  constructor(private readonly lockAvailable = true) {}

  acquire(): boolean {
    return this.lockAvailable;
  }

  onOpenRequest(listener: (request: OpenRequest) => void): Unsubscribe {
    return this.requests.on(listener);
  }

  deliver(request: OpenRequest): void {
    this.requests.emit(request);
  }
}

export class FakeOsShell implements OsShell {
  readonly calls: { method: keyof OsShell; target: string }[] = [];

  async openExternal(url: string): Promise<void> {
    this.calls.push({ method: 'openExternal', target: url });
  }

  async openPath(path: string): Promise<void> {
    this.calls.push({ method: 'openPath', target: path });
  }

  revealInFileManager(path: string): void {
    this.calls.push({ method: 'revealInFileManager', target: path });
  }
}

export function fakeAppPaths(root = '/home/test'): AppPaths {
  return {
    configDir: `${root}/.config/galeo`,
    stateDir: `${root}/.local/state/galeo`,
    cacheDir: `${root}/.cache/galeo`,
  };
}

export class FakeSystemMetrics implements SystemMetrics {
  samples = new Map<number, number>();
  /** The next sample rejects, as a failed metrics call would. */
  failNext = false;

  async sampleWindowMemory(): Promise<ReadonlyMap<number, number>> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('sample failed');
    }
    return new Map(this.samples);
  }
}
