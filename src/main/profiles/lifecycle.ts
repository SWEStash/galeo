/** What starting and stopping needs of a profile's runtime. */
interface Runnable {
  id: string;
  has(window: number): boolean;
  /** Saves its session and settings, then lets go of them. */
  stop(): Promise<void>;
  settings: { start(): Promise<void>; stop(): void };
}

/**
 * The running profiles (ADR-005), by id. A profile runs while it has a window. Its save on stopping
 * is kept until it lands: starting it again, deleting it and quitting all wait for that save.
 */
export class RunningProfiles<P extends Runnable> {
  private readonly running = new Map<string, P>();
  private readonly stopping = new Map<string, Promise<void>>();

  constructor(
    private readonly deps: {
      /** A new runtime for the profile, its listeners wired, not started. */
      create: (id: string) => Promise<P>;
      /** The set of running profiles changed. */
      changed: () => void;
    },
  ) {}

  get(id: string): P | undefined {
    return this.running.get(id);
  }

  has(id: string): boolean {
    return this.running.has(id);
  }

  values(): IterableIterator<P> {
    return this.running.values();
  }

  /** The profile the window belongs to. */
  of(window: number): P | undefined {
    return [...this.running.values()].find((profile) => profile.has(window));
  }

  /** Starts the profile once its last save has landed; it isn't running if its settings fail to start. */
  async start(id: string): Promise<P> {
    await this.stopping.get(id);
    const profile = await this.deps.create(id);
    this.running.set(id, profile);
    try {
      await profile.settings.start();
    } catch (error) {
      this.running.delete(id);
      profile.settings.stop();
      throw error;
    }
    return profile;
  }

  /** Stops the profile and saves it; a failed save is logged. */
  stop(profile: P): void {
    this.running.delete(profile.id);
    const stop = profile
      .stop()
      .catch((error: unknown) => console.warn(`galeo: profile ${profile.id} not saved`, error))
      .finally(() => this.stopping.get(profile.id) === stop && this.stopping.delete(profile.id));
    this.deps.changed();
    this.stopping.set(profile.id, stop);
  }

  /** Resolves once the profile's save on stopping has landed (at once if it isn't stopping). */
  async stopped(id: string): Promise<void> {
    await this.stopping.get(id);
  }

  /** Saves every running profile, and waits for the ones already stopping. */
  async quit(): Promise<void> {
    const saves = [...this.running.values()].map((profile) => profile.stop());
    await Promise.allSettled([...saves, ...this.stopping.values()]);
  }
}
