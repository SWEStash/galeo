import { rename as fsRename } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const ATTEMPTS = 20;
const PAUSE_MS = 10;

/**
 * Renames `from` over `to`. Windows refuses that for a moment while another program has `to` open
 * (a virus scanner, the search indexer) with EPERM or EBUSY; editors there try again, and so does
 * this, for about 200 ms. Any other error, and any error elsewhere, fails at once.
 */
export async function renameOver(
  from: string,
  to: string,
  { rename = fsRename, platform = process.platform, pause = () => sleep(PAUSE_MS) }: { rename?: (from: string, to: string) => Promise<void>; platform?: string; pause?: () => Promise<unknown> } = {},
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await rename(from, to);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (platform !== 'win32' || (code !== 'EPERM' && code !== 'EBUSY') || attempt === ATTEMPTS) throw error;
      await pause();
    }
  }
}
