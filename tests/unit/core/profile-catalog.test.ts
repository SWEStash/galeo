import { describe, expect, it } from 'vitest';
import { ProfileCatalog } from '../../../src/core/profiles/catalog';
import type { Parse } from '../../../src/core/settings/json-file';
import type { ProfileFile } from '../../../src/core/settings/profile-settings';
import { utf8 } from '../../../src/main/adapters/utf8';
import { FakeFileSystem } from '../../helpers/fakes';

const CONFIG = '/config';
const STATE = '/state';
const parse: Parse<ProfileFile> = (data) => {
  const { schemaVersion: _, ...value } = data as ProfileFile & { schemaVersion: number };
  return typeof value.name === 'string' || value.name === undefined ? { ok: true, value } : { ok: false, detail: 'bad name' };
};

function setup(files: Record<string, string> = {}) {
  const fs = new FakeFileSystem(files);
  return { fs, catalog: new ProfileCatalog({ fs, utf8, configDir: CONFIG, stateDir: STATE, parse }) };
}

const profileJson = (value: object) => JSON.stringify({ schemaVersion: 1, ...value });
const read = async (fs: FakeFileSystem, path: string) => JSON.parse(new TextDecoder().decode(await fs.readFile(path, { maxBytes: 1e6 })));

describe('ProfileCatalog.list', () => {
  it('always has default, even with nothing on disk', async () => {
    const { catalog } = setup();
    expect(await catalog.list()).toEqual([{ id: 'default', name: 'default', accent: null }]);
  });

  it('lists each profile folder with its name and accent, default first, then by name', async () => {
    const { catalog } = setup({
      [`${CONFIG}/profiles/zeta/profile.json`]: profileJson({ name: 'Zeta' }),
      [`${CONFIG}/profiles/acme/profile.json`]: profileJson({ name: 'Acme Corp', accent: '#1a7f5a' }),
      [`${CONFIG}/profiles/default/profile.json`]: profileJson({ accent: '#335577' }),
    });
    expect(await catalog.list()).toEqual([
      { id: 'default', name: 'default', accent: '#335577' },
      { id: 'acme', name: 'Acme Corp', accent: '#1a7f5a' },
      { id: 'zeta', name: 'Zeta', accent: null },
    ]);
  });

  it('names a profile by its id when its file is missing or invalid', async () => {
    const { catalog } = setup({
      [`${CONFIG}/profiles/beta/custom.css`]: '',
      [`${CONFIG}/profiles/broken/profile.json`]: '{ not json',
      [`${CONFIG}/profiles/wrong/profile.json`]: profileJson({ name: 3 }),
    });
    expect((await catalog.list()).map((profile) => profile.name)).toEqual(['default', 'beta', 'broken', 'wrong']);
  });

  it('ignores entries that are not profile folders', async () => {
    const { fs, catalog } = setup({
      [`${CONFIG}/profiles/notes.txt`]: 'x',
      [`${CONFIG}/profiles/Upper/profile.json`]: profileJson({ name: 'Upper' }),
      [`${CONFIG}/profiles/.hidden/profile.json`]: profileJson({ name: 'Hidden' }),
    });
    fs.symlink(`${CONFIG}/profiles/linked`, '/elsewhere');
    expect((await catalog.list()).map((profile) => profile.id)).toEqual(['default']);
  });
});

describe('ProfileCatalog.create', () => {
  it('writes profile.json with the name and accent, owner-only', async () => {
    const { fs, catalog } = setup();
    expect(await catalog.create('acme', 'Acme', '#1a7f5a')).toEqual({ id: 'acme', name: 'Acme', accent: '#1a7f5a' });
    const path = `${CONFIG}/profiles/acme/profile.json`;
    expect(await read(fs, path)).toEqual({ schemaVersion: 1, name: 'Acme', accent: '#1a7f5a' });
    expect(fs.modeOf(path)).toBe(0o600);
    expect(fs.modeOf(`${CONFIG}/profiles/acme`)).toBe(0o700);
    expect((await catalog.list()).map((profile) => profile.id)).toEqual(['default', 'acme']);
  });

  it('refuses an id that exists or that is not a plain id', async () => {
    const { catalog } = setup({ [`${CONFIG}/profiles/acme/profile.json`]: profileJson({ name: 'Acme' }) });
    await expect(catalog.create('acme', 'Other', null)).rejects.toThrow(/exists/);
    await expect(catalog.create('default', 'Other', null)).rejects.toThrow(/exists/);
    await expect(catalog.create('../x', 'X', null)).rejects.toThrow(/id/);
  });

  it('refuses an unusable name', async () => {
    const { catalog } = setup();
    await expect(catalog.create('x', ' ', null)).rejects.toThrow(/name/);
  });
});

describe('ProfileCatalog.update', () => {
  it('renames and recolours, keeping the setting overrides', async () => {
    const path = `${CONFIG}/profiles/acme/profile.json`;
    const { fs, catalog } = setup({ [path]: profileJson({ name: 'Acme', settings: { fontSize: 18 } }) });
    const result = await catalog.update('acme', { name: ' Acme EU ', accent: '#335577' });
    expect(result).toEqual({ ok: true, profile: { id: 'acme', name: 'Acme EU', accent: '#335577' } });
    expect(await read(fs, path)).toEqual({ schemaVersion: 1, name: 'Acme EU', accent: '#335577', settings: { fontSize: 18 } });
  });

  it('leaves an invalid hand edit untouched and reports it', async () => {
    const path = `${CONFIG}/profiles/acme/profile.json`;
    const { fs, catalog } = setup({ [path]: '{ broken' });
    const result = await catalog.update('acme', { name: 'New' });
    expect(result).toMatchObject({ ok: false, notice: { path, reason: 'invalid' } });
    expect(new TextDecoder().decode(await fs.readFile(path, { maxBytes: 1e6 }))).toBe('{ broken');
  });

  it('refuses an unknown profile or an unusable name', async () => {
    const { catalog } = setup({ [`${CONFIG}/profiles/acme/profile.json`]: profileJson({ name: 'Acme' }) });
    await expect(catalog.update('nope', { name: 'X' })).rejects.toThrow(/no such profile/);
    await expect(catalog.update('acme', { name: '' })).rejects.toThrow(/name/);
  });

  it('can recolour default, which has no file yet', async () => {
    const { fs, catalog } = setup();
    await catalog.update('default', { accent: '#335577' });
    expect(await read(fs, `${CONFIG}/profiles/default/profile.json`)).toEqual({ schemaVersion: 1, accent: '#335577' });
  });
});

describe('ProfileCatalog.delete', () => {
  it('removes the profile’s config and state, nothing else', async () => {
    const { fs, catalog } = setup({
      [`${CONFIG}/profiles/acme/profile.json`]: profileJson({ name: 'Acme' }),
      [`${CONFIG}/profiles/acme/custom.css`]: '',
      [`${STATE}/profiles/acme/session.json`]: '{}',
      [`${STATE}/profiles/acme-2/session.json`]: '{}',
      [`${STATE}/profiles/default/session.json`]: '{}',
    });
    await catalog.delete('acme');
    await expect(fs.stat(`${CONFIG}/profiles/acme`)).rejects.toThrow(/ENOENT/);
    await expect(fs.stat(`${STATE}/profiles/acme`)).rejects.toThrow(/ENOENT/);
    await expect(fs.stat(`${STATE}/profiles/acme-2/session.json`)).resolves.toBeDefined();
    await expect(fs.stat(`${STATE}/profiles/default/session.json`)).resolves.toBeDefined();
  });

  it('never deletes default or anything that is not a plain id', async () => {
    const { fs, catalog } = setup({ [`${STATE}/profiles/default/session.json`]: '{}', [`${STATE}/x`]: 'x' });
    await expect(catalog.delete('default')).rejects.toThrow(/default/);
    await expect(catalog.delete('..')).rejects.toThrow(/id/);
    await expect(catalog.delete('')).rejects.toThrow(/id/);
    await expect(fs.stat(`${STATE}/x`)).resolves.toBeDefined();
  });
});
