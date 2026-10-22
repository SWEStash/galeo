import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, migrate, resolveSettings } from './model';

describe('resolveSettings', () => {
  it('starts from the built-in defaults', () => {
    expect(resolveSettings({}, {})).toEqual(DEFAULT_SETTINGS);
    // Tables (ADR-021): the separator found, and a header row.
    expect(DEFAULT_SETTINGS).toMatchObject({ tableSeparator: 'auto', tableHeader: true });
    // ADR-023: the tab bar on top; a 220 px panel once a profile puts its tabs on the left.
    expect(DEFAULT_SETTINGS).toMatchObject({ tabsPosition: 'top', tabPanelWidth: 220 });
  });

  it('lets the global file override the defaults, and the profile override both', () => {
    const settings = resolveSettings({ fontSize: 18, themeMode: 'dark' }, { fontSize: 20 });
    expect(settings).toMatchObject({ fontSize: 20, themeMode: 'dark', measure: DEFAULT_SETTINGS.measure });
  });

  it('never shares arrays with the defaults', () => {
    resolveSettings({}, {}).quickOpenExclude.push('x');
    expect(DEFAULT_SETTINGS.quickOpenExclude).not.toContain('x');
  });
});

describe('migrate', () => {
  const migrations = {
    1: (data: Record<string, unknown>) => ({ ...data, size: data['fontSize'] }),
    2: (data: Record<string, unknown>) => ({ ...data, renamed: true }),
  };

  it('runs every migration from the file version up to the current one, in order', () => {
    expect(migrate({ schemaVersion: 1, fontSize: 18 }, 3, migrations)).toEqual({
      kind: 'ok',
      data: { schemaVersion: 3, fontSize: 18, size: 18, renamed: true },
    });
  });

  it('leaves a current file as it is', () => {
    expect(migrate({ schemaVersion: 3, a: 1 }, 3, migrations)).toEqual({ kind: 'ok', data: { schemaVersion: 3, a: 1 } });
  });

  it('takes a hand-written file without a version as version 1', () => {
    expect(migrate({ fontSize: 18 }, 2, migrations)).toMatchObject({ kind: 'ok', data: { schemaVersion: 2, size: 18 } });
  });

  it('refuses a file from a newer galeo', () => {
    expect(migrate({ schemaVersion: 4 }, 3, migrations)).toEqual({ kind: 'newer', version: 4 });
  });

  it.each([null, [], 'text', 3, { schemaVersion: '2' }, { schemaVersion: 0 }, { schemaVersion: 1.5 }])(
    'refuses %j as not a settings object',
    (data) => {
      expect(migrate(data, 3, migrations).kind).toBe('invalid');
    },
  );
});
