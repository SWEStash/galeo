import { describe, expect, it } from 'vitest';
import { AppState } from '../../../src/core/profiles/app-state';
import type { Parse } from '../../../src/core/settings/json-file';
import { utf8 } from '../../../src/main/adapters/utf8';
import { FakeFileSystem } from '../../helpers/fakes';

const PATH = '/state/app-state.json';
const parse: Parse<{ lastProfile: string | null }> = (data) => {
  const value = (data as { lastProfile?: unknown }).lastProfile;
  return typeof value === 'string' || value === null ? { ok: true, value: { lastProfile: value } } : { ok: false, detail: 'lastProfile' };
};

function setup(files: Record<string, string> = {}) {
  const fs = new FakeFileSystem(files);
  let writes = 0;
  const write = fs.writeFileAtomic.bind(fs);
  fs.writeFileAtomic = async (...args) => {
    writes++;
    return write(...args);
  };
  return { fs, state: new AppState({ fs, utf8, path: PATH, parse }), writes: () => writes };
}

const saved = async (fs: FakeFileSystem) => JSON.parse(new TextDecoder().decode(await fs.readFile(PATH, { maxBytes: 1e6 })));

describe('AppState (ADR-005: last-used profile)', () => {
  it('has no last profile before one was used', async () => {
    const { state } = setup();
    await state.load();
    expect(state.lastProfile).toBeNull();
  });

  it('remembers the last profile across loads, owner-only', async () => {
    const { fs, state } = setup();
    await state.load();
    await state.setLastProfile('acme');
    expect(await saved(fs)).toEqual({ schemaVersion: 1, lastProfile: 'acme' });
    expect(fs.modeOf(PATH)).toBe(0o600);
    const again = new AppState({ fs, utf8, path: PATH, parse });
    await again.load();
    expect(again.lastProfile).toBe('acme');
  });

  it('writes only when the profile changes', async () => {
    const { state, writes } = setup();
    await state.load();
    await state.setLastProfile('acme');
    await state.setLastProfile('acme');
    await state.setLastProfile('default');
    expect(writes()).toBe(2);
  });

  it('sets an invalid file aside and starts empty', async () => {
    const { fs, state } = setup({ [PATH]: '{"lastProfile": 7}' });
    await state.load();
    expect(state.lastProfile).toBeNull();
    await expect(fs.stat(`${PATH}.invalid`)).resolves.toBeDefined();
  });

  it('ignores a stored value that is not a profile id', async () => {
    const { state } = setup({ [PATH]: '{"schemaVersion":1,"lastProfile":"../x"}' });
    await state.load();
    expect(state.lastProfile).toBeNull();
  });
});
