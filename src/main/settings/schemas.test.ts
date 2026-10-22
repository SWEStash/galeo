import { describe, expect, it } from 'vitest';
import { parseGlobalSettings, parseProfileFile } from './schemas';

describe('parseGlobalSettings', () => {
  it('accepts every v0.1 setting', () => {
    const file = {
      schemaVersion: 1,
      themeMode: 'dark',
      proseFont: 'Source Serif 4',
      codeFont: 'JetBrains Mono',
      fontSize: 18,
      measure: 80,
      statusBar: false,
      quickOpenExclude: ['dist'],
      warmTabs: 2,
      warmMegabytes: 40,
    };
    const { schemaVersion: _v, ...settings } = file;
    expect(parseGlobalSettings(file)).toEqual({ ok: true, value: settings });
  });

  it('takes a full-width measure as well as one in characters', () => {
    expect(parseGlobalSettings({ schemaVersion: 1, measure: 'full' })).toEqual({ ok: true, value: { measure: 'full' } });
  });

  it('takes tabs on the left and a whole-pixel panel width (ADR-023)', () => {
    expect(parseGlobalSettings({ schemaVersion: 1, tabsPosition: 'left', tabPanelWidth: 300 })).toEqual({ ok: true, value: { tabsPosition: 'left', tabPanelWidth: 300 } });
  });

  it('accepts a file that sets nothing', () => {
    expect(parseGlobalSettings({ schemaVersion: 1 })).toEqual({ ok: true, value: {} });
  });

  it.each([
    ['an unknown key (a typo)', { fontsize: 18 }],
    ['a wrong type', { statusBar: 'no' }],
    ['a size out of range', { fontSize: 400 }],
    ['a fractional tab count', { warmTabs: 1.5 }],
    ['an unknown theme', { themeMode: 'sepia' }],
    ['a measure out of range', { measure: 30 }],
    ['a measure named otherwise', { measure: 'wide' }],
    ['an empty font name', { proseFont: '' }],
    ['tabs on the right', { tabsPosition: 'right' }],
    ['a tab panel narrower than 140 px', { tabPanelWidth: 139 }],
    ['a tab panel wider than 480 px', { tabPanelWidth: 481 }],
    ['a fractional tab panel width', { tabPanelWidth: 220.5 }],
    ['a huge exclusion list', { quickOpenExclude: Array.from({ length: 1001 }, (_, n) => `d${n}`) }],
  ])('refuses %s, naming it', (_name, settings) => {
    expect(parseGlobalSettings({ schemaVersion: 1, ...settings })).toEqual({ ok: false, detail: expect.stringMatching(/\S/) });
  });

  it('refuses a __proto__ key without touching any prototype', () => {
    const hostile = JSON.parse('{"schemaVersion":1,"__proto__":{"polluted":true},"fontSize":18}') as unknown;
    expect(parseGlobalSettings(hostile).ok).toBe(false);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});

describe('parseProfileFile', () => {
  it('accepts a name, an accent colour and overrides', () => {
    expect(parseProfileFile({ schemaVersion: 1, name: 'Acme', accent: '#3366ff', settings: { fontSize: 20 } })).toEqual({
      ok: true,
      value: { name: 'Acme', accent: '#3366ff', settings: { fontSize: 20 } },
    });
  });

  it.each([
    ['a colour that is not #rrggbb', { accent: 'red' }],
    ['an invalid override', { settings: { fontSize: 'big' } }],
    ['an unknown key', { theme: 'dark' }],
  ])('refuses %s', (_name, file) => {
    expect(parseProfileFile({ schemaVersion: 1, ...file }).ok).toBe(false);
  });
});
