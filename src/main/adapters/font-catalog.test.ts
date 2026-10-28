import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { EmptyFontCatalog, FcListFontCatalog } from './font-catalog';
import type { RunFile } from './run-file';

describe('FcListFontCatalog', () => {
  it('runs fc-list once with fixed arguments, a timeout and an output cap, and caches the list', async () => {
    const run = vi.fn<RunFile>().mockResolvedValue('Inter\t\nHack\t100\n');
    const catalog = new FcListFontCatalog(run);
    expect(await catalog.list()).toEqual([
      { family: 'Hack', mono: true },
      { family: 'Inter', mono: false },
    ]);
    await catalog.list();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('fc-list', ['-f', '%{family[0]}\\t%{spacing}\\n'], { timeout: 5000, maxBuffer: 4 * 1024 * 1024 });
  });

  it('lists nothing, without throwing, when fc-list is missing, fails, overruns or says too much', async () => {
    for (const failure of [
      Object.assign(new Error('spawn fc-list ENOENT'), { code: 'ENOENT' }),
      Object.assign(new Error('Command failed'), { code: 1 }),
      Object.assign(new Error('timed out'), { killed: true, signal: 'SIGTERM' }),
      Object.assign(new RangeError('stdout maxBuffer length exceeded'), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }),
    ]) {
      const catalog = new FcListFontCatalog(vi.fn<RunFile>().mockRejectedValue(failure));
      expect(await catalog.list()).toEqual([]);
    }
  });

  it('keeps a failure for a minute, logging it once, then asks again (fontconfig may be back)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let now = 1_000;
    const run = vi.fn<RunFile>().mockRejectedValueOnce(new Error('busy')).mockResolvedValue('Inter\t\n');
    const catalog = new FcListFontCatalog(run, () => now);
    expect(await catalog.list()).toEqual([]);
    now += 59_999;
    expect(await catalog.list()).toEqual([]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('galeo: listing the system fonts failed; trying again in a minute', expect.any(Error));
    now += 1;
    expect(await catalog.list()).toEqual([{ family: 'Inter', mono: false }]);
    expect(run).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

const hasFcList = (() => {
  try {
    execFileSync('fc-list', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasFcList)('FcListFontCatalog with the real fc-list', () => {
  it('lists families our format and parser understand', async () => {
    const fonts = await new FcListFontCatalog().list();
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts) expect(font.family).toMatch(/^\S(.*\S)?$/);
  });
});

describe('EmptyFontCatalog', () => {
  it('lists nothing (platforms without fontconfig offer the bundled fonts only)', async () => {
    expect(await new EmptyFontCatalog().list()).toEqual([]);
  });
});
