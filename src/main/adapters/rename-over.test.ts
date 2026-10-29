import { describe, expect, it } from 'vitest';
import { renameOver } from './rename-over';

/** A rename that fails with `codes`, one per call, then succeeds. */
function failing(...codes: string[]) {
  const calls: Array<[string, string]> = [];
  return {
    calls,
    rename: async (from: string, to: string) => {
      calls.push([from, to]);
      const code = codes.shift();
      if (code) throw Object.assign(new Error(code), { code });
    },
  };
}

const pause = async () => {};

describe('renameOver', () => {
  it('on Windows, tries again while another program holds the file for a moment', async () => {
    const fake = failing('EPERM', 'EBUSY', 'EPERM');
    await renameOver('a.tmp', 'a.md', { rename: fake.rename, platform: 'win32', pause });
    expect(fake.calls).toHaveLength(4);
  });

  it('on Windows, gives up after about 200 ms with the last error', async () => {
    const fake = failing(...Array<string>(30).fill('EPERM'));
    await expect(renameOver('a.tmp', 'a.md', { rename: fake.rename, platform: 'win32', pause })).rejects.toMatchObject({ code: 'EPERM' });
    expect(fake.calls).toHaveLength(20);
  });

  it('fails at once for any other error, and on other systems', async () => {
    const missing = failing('ENOENT');
    await expect(renameOver('a.tmp', 'a.md', { rename: missing.rename, platform: 'win32', pause })).rejects.toMatchObject({ code: 'ENOENT' });
    expect(missing.calls).toHaveLength(1);
    const linux = failing('EPERM');
    await expect(renameOver('a.tmp', 'a.md', { rename: linux.rename, platform: 'linux', pause })).rejects.toMatchObject({ code: 'EPERM' });
    expect(linux.calls).toHaveLength(1);
  });
});
