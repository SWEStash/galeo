import { shell } from 'electron';
import type { OsShell } from '../../core/ports';

/** The desktop hand-offs. Callers check capabilities first (SR-04, SR-05). */
export class ElectronOsShell implements OsShell {
  openExternal(url: string): Promise<void> {
    return shell.openExternal(url);
  }

  async openPath(path: string): Promise<void> {
    const error = await shell.openPath(path);
    if (error) throw new Error(error);
  }

  revealInFileManager(path: string): void {
    shell.showItemInFolder(path);
  }
}

/** For unpackaged test runs: records external opens, file opens and reveals instead of starting other apps. */
export class RecordingOsShell extends ElectronOsShell {
  constructor(
    private readonly opened: string[],
    private readonly revealed: string[],
    private readonly openedPaths: string[],
  ) {
    super();
  }

  override async openPath(path: string): Promise<void> {
    this.openedPaths.push(path);
  }

  override async openExternal(url: string): Promise<void> {
    this.opened.push(url);
  }

  override revealInFileManager(path: string): void {
    this.revealed.push(path);
  }
}
