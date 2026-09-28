import { describe, expect, it } from 'vitest';
import { ConfigFile, type Parse } from '../../../src/core/settings/config-file';
import { utf8 } from '../../../src/main/adapters/utf8';
import { FakeFileSystem } from '../../helpers/fakes';

const PATH = '/cfg/galeo/settings.json';
const text = (s: string) => new TextEncoder().encode(s);

/** Accepts objects whose values are all numbers; stands in for the real schema. */
const parse: Parse<Record<string, number>> = (data) => {
  const { schemaVersion: _version, ...rest } = data as Record<string, unknown>;
  return Object.values(rest).every((value) => typeof value === 'number')
    ? { ok: true, value: rest as Record<string, number> }
    : { ok: false, detail: 'values must be numbers' };
};

function setup(files: Record<string, string> = {}) {
  const fs = new FakeFileSystem(files);
  const file = new ConfigFile({ fs, utf8, path: PATH, parse, empty: {}, version: 1, migrations: {}, maxBytes: 64 });
  return { fs, file };
}

async function contents(fs: FakeFileSystem, path = PATH) {
  return new TextDecoder().decode(await fs.readFile(path, { maxBytes: 1024 }));
}

describe('ConfigFile.load', () => {
  it('uses the empty value when there is no file', async () => {
    const { file } = setup();
    expect(await file.load()).toEqual({ value: {}, notice: null });
  });

  it('reads a valid file', async () => {
    const { file } = setup({ [PATH]: '{"schemaVersion":1,"fontSize":18}' });
    expect(await file.load()).toEqual({ value: { fontSize: 18 }, notice: null });
  });

  it.each([
    ['not JSON', '{"fontSize":', 'invalid'],
    ['a schema error', '{"fontSize":"big"}', 'invalid'],
    ['a newer version', '{"schemaVersion":7}', 'newer-version'],
    ['over the size cap', `{"a":${'1'.repeat(80)}}`, 'too-large'],
  ] as const)('keeps the last valid value after %s, with a notice', async (_name, content, reason) => {
    const { fs, file } = setup({ [PATH]: '{"fontSize":18}' });
    await file.load();
    fs.write(PATH, content);
    const loaded = await file.load();
    expect(loaded.value).toEqual({ fontSize: 18 });
    expect(loaded.notice).toMatchObject({ path: PATH, reason });
  });

  it('refuses a file that is not UTF-8', async () => {
    const { fs, file } = setup();
    // `{"\xff":1}`: valid JSON if the bad byte were silently replaced.
    fs.write(PATH, new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d]));
    expect((await file.load()).notice).toMatchObject({ reason: 'invalid' });
  });

  it('reports an unreadable file', async () => {
    const { fs, file } = setup({ [PATH]: '{}' });
    fs.failWith(PATH, 'EACCES');
    expect((await file.load()).notice).toMatchObject({ reason: 'unreadable' });
  });

  it('clears the notice once the file is fixed', async () => {
    const { fs, file } = setup({ [PATH]: '{' });
    expect((await file.load()).notice).not.toBeNull();
    fs.write(PATH, '{"fontSize":16}');
    expect(await file.load()).toEqual({ value: { fontSize: 16 }, notice: null });
  });

  it('does not rewrite a file it migrated', async () => {
    const fs = new FakeFileSystem({ [PATH]: '{"schemaVersion":1,"old":1}' });
    const file = new ConfigFile({
      fs,
      utf8,
      path: PATH,
      parse,
      empty: {},
      version: 2,
      migrations: { 1: ({ old, ...rest }) => ({ ...rest, renamed: old }) },
      maxBytes: 64,
    });
    expect((await file.load()).value).toEqual({ renamed: 1 });
    expect(await contents(fs)).toBe('{"schemaVersion":1,"old":1}');
  });
});

describe('ConfigFile.update', () => {
  it('re-reads the file right before writing, so a hand edit made meanwhile is kept', async () => {
    const { fs, file } = setup({ [PATH]: '{"fontSize":18}' });
    await file.load();
    fs.write(PATH, '{"fontSize":18,"measure":80}');
    const result = await file.update((value) => ({ ...value, fontSize: 20 }));
    expect(result).toEqual({ value: { fontSize: 20, measure: 80 }, notice: null });
    expect(JSON.parse(await contents(fs))).toEqual({ schemaVersion: 1, fontSize: 20, measure: 80 });
    expect(fs.modeOf(PATH)).toBe(0o600);
  });

  it('never overwrites an invalid hand edit', async () => {
    const { fs, file } = setup({ [PATH]: '{"fontSize":18}' });
    await file.load();
    fs.write(PATH, '{"fontSize": oops');
    const result = await file.update((value) => ({ ...value, fontSize: 20 }));
    expect(result.notice).toMatchObject({ reason: 'invalid' });
    expect(result.value).toEqual({ fontSize: 18 });
    expect(await contents(fs)).toBe('{"fontSize": oops');
  });

  it('creates the file and its folder when there was none', async () => {
    const { fs, file } = setup();
    await file.update(() => ({ fontSize: 15 }));
    expect(JSON.parse(await contents(fs))).toEqual({ schemaVersion: 1, fontSize: 15 });
    expect(fs.modeOf('/cfg/galeo')).toBe(0o700);
  });
});
