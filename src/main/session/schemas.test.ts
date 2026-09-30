import { describe, expect, it } from 'vitest';
import { parseAppState, parseRecentFiles, parseSession } from './schemas';

const tab = { entries: [{ path: '/d/a.md', anchor: null }], index: 0 };
const valid = {
  schemaVersion: 1,
  savedAt: 1_700_000_000_000,
  focusOrder: [0],
  windows: [
    {
      bounds: { x: 0, y: 0, width: 1100, height: 800, maximized: false },
      active: 0,
      tabs: [
        tab,
        {
          entries: [
            { path: '/d/b.txt', anchor: 'intro', encoding: 'windows-1252', position: { line: 3, offset: 0, heading: null, fraction: 0.1 }, view: 'source' },
            { path: '/d/c.log', anchor: null, view: 'source', follow: true },
          ],
          index: 0,
          zoom: 1.25,
        },
      ],
    },
  ],
};

describe('parseSession (SR-17)', () => {
  it('accepts a session and drops its version', () => {
    const { schemaVersion: _v, ...session } = valid;
    expect(parseSession(valid)).toEqual({ ok: true, value: session });
  });

  it.each([
    ['an index outside the history', { ...valid, windows: [{ ...valid.windows[0]!, tabs: [{ ...tab, index: 1 }] }] }],
    ['an active tab that does not exist', { ...valid, windows: [{ ...valid.windows[0]!, active: 5 }] }],
    ['a focus order naming a missing window', { ...valid, focusOrder: [1] }],
    ['a relative path', { ...valid, windows: [{ ...valid.windows[0]!, tabs: [{ entries: [{ path: 'a.md', anchor: null }], index: 0 }] }] }],
    ['an unknown view', { ...valid, windows: [{ ...valid.windows[0]!, tabs: [{ entries: [{ path: '/d/a.md', anchor: null, view: 'raw' }], index: 0 }] }] }],
    ['a follow state other than true', { ...valid, windows: [{ ...valid.windows[0]!, tabs: [{ entries: [{ path: '/d/a.md', anchor: null, follow: false }], index: 0 }] }] }],
    ['a zoom out of range', { ...valid, windows: [{ ...valid.windows[0]!, tabs: [{ ...tab, zoom: 9 }] }] }],
    ['document text smuggled in', { ...valid, windows: [{ ...valid.windows[0]!, tabs: [{ ...tab, text: '# secret' }] }] }],
    ['too many windows', { ...valid, windows: Array.from({ length: 51 }, () => valid.windows[0]!), focusOrder: [] }],
  ])('refuses %s', (_name, session) => {
    expect(parseSession(session).ok).toBe(false);
  });
});

describe('parseSession holds whatever the app itself can write', () => {
  const withEntries = (entries: unknown[]) => ({ ...valid, windows: [{ ...valid.windows[0]!, active: 0, tabs: [{ entries, index: entries.length - 1 }] }] });

  it('takes Windows UNC paths and anchors as long as a link may be', () => {
    expect(parseSession(withEntries([{ path: '\\\\srv\\share\\a.md', anchor: 'x'.repeat(8192) }])).ok).toBe(true);
  });

  it('takes the whole history a tab keeps, and no more', () => {
    const entry = { path: '/d/a.md', anchor: null };
    expect(parseSession(withEntries(Array.from({ length: 50 }, () => entry))).ok).toBe(true);
    expect(parseSession(withEntries(Array.from({ length: 51 }, () => entry))).ok).toBe(false);
  });
});

describe('parseRecentFiles', () => {
  it('accepts paths and times only', () => {
    expect(parseRecentFiles({ schemaVersion: 1, files: [{ path: '/d/a.md', openedAt: 1 }] }).ok).toBe(true);
    expect(parseRecentFiles({ schemaVersion: 1, files: [{ path: '/d/a.md', openedAt: 1, text: 'x' }] }).ok).toBe(false);
    expect(parseRecentFiles({ schemaVersion: 1, files: Array.from({ length: 201 }, (_, n) => ({ path: `/d/${n}`, openedAt: n })) }).ok).toBe(false);
  });
});

describe('parseAppState', () => {
  it('accepts the last profile, an id or null, and nothing else', () => {
    expect(parseAppState({ schemaVersion: 1, lastProfile: 'acme' })).toEqual({ ok: true, value: { lastProfile: 'acme' } });
    expect(parseAppState({ schemaVersion: 1, lastProfile: null }).ok).toBe(true);
    expect(parseAppState({ schemaVersion: 1, lastProfile: '../x' }).ok).toBe(false);
    expect(parseAppState({ schemaVersion: 1, lastProfile: 'acme', extra: 1 }).ok).toBe(false);
  });
});
