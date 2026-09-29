import type {
  AppPaths,
  FileWatcher,
  InstanceChannel,
  MenuItem,
  OpenRequest,
  OsShell,
  SystemMetrics,
  Unsubscribe,
  WatchEvent,
  WindowHost,
  WindowId,
} from '../../../src/core/ports';

/** A listener set with an `emit` for tests to drive events. */
class Emitter<Args extends unknown[]> {
  private readonly listeners = new Set<(...args: Args) => void>();

  on(listener: (...args: Args) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(...args: Args): void {
    for (const listener of this.listeners) listener(...args);
  }
}

export class FakeFileWatcher implements FileWatcher {
  private readonly emitters = new Map<string, Emitter<[WatchEvent]>>();

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

export class FakeWindowHost implements WindowHost {
  readonly windows = new Map<WindowId, { title: string }>();
  readonly focusCalls: WindowId[] = [];
  /** The id the next context menu resolves with (null = dismissed). */
  menuChoice: string | null = null;
  readonly menus: { id: WindowId; items: readonly MenuItem[] }[] = [];
  private nextId = 1;
  private readonly focusEvents = new Emitter<[WindowId]>();
  private readonly closedEvents = new Emitter<[WindowId]>();
  private readonly capabilityKeys = new Emitter<[WindowId, string]>();

  create({ title }: { title: string }): WindowId {
    const id: WindowId = this.nextId++;
    this.windows.set(id, { title });
    return id;
  }

  focus(id: WindowId): void {
    this.focusCalls.push(id);
    this.focusEvents.emit(id);
  }

  close(id: WindowId): void {
    if (this.windows.delete(id)) this.closedEvents.emit(id);
  }

  setTitle(id: WindowId, title: string): void {
    const window = this.windows.get(id);
    if (window) window.title = title;
  }

  onFocus(listener: (id: WindowId) => void): Unsubscribe {
    return this.focusEvents.on(listener);
  }

  onClosed(listener: (id: WindowId) => void): Unsubscribe {
    return this.closedEvents.on(listener);
  }

  onCapabilityKey(listener: (id: WindowId, key: string) => void): Unsubscribe {
    return this.capabilityKeys.on(listener);
  }

  pressCapabilityKey(id: WindowId, key: string): void {
    this.capabilityKeys.emit(id, key);
  }

  async showContextMenu(id: WindowId, items: readonly MenuItem[]): Promise<string | null> {
    this.menus.push({ id, items });
    return this.menuChoice;
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
