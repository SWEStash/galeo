import { describe, expect, it } from 'vitest';
import { requestSchemas } from '../../shared/contracts/schemas';

const ID = '0b6c1d2e-8f1a-4c3b-9d4e-5f6a7b8c9d0e';
const accepts = (channel: keyof typeof requestSchemas, args: unknown[]) => requestSchemas[channel].safeParse(args).success;

describe('document channel arguments (SR-11)', () => {
  it.each(['documents.read', 'documents.back', 'documents.forward', 'documents.pathMenu', 'documents.contextMenu', 'documents.leaveEdit', 'documents.recover', 'recent.open', 'tabs.activated', 'tabs.rendering', 'tabs.renderAgain', 'tabs.close'] as const)('%s takes one document id', (channel) => {
    expect(accepts(channel, [ID])).toBe(true);
    for (const bad of [[], [''], ['x'.repeat(65)], [42], [null], [{ id: ID }], [ID, 'extra']]) {
      expect(accepts(channel, bad)).toBe(false);
    }
  });

  it('documents.save takes an id, text up to the read cap (empty too) and the version it was loaded from (null: the file was gone)', () => {
    const channel = 'documents.save';
    expect(accepts(channel, [ID, '', 'a'.repeat(64)])).toBe(true);
    expect(accepts(channel, [ID, '# text', 'a'.repeat(64)])).toBe(true);
    expect(accepts(channel, [ID, '# text', null])).toBe(true);
    for (const bad of [[ID, 'text'], [ID, 'text', ''], [ID, 'text', 'a'.repeat(129)], [ID, 7, 'v'], ['', 'text', 'v'], [ID, 'text', 'v', 'extra']]) {
      expect(accepts(channel, bad)).toBe(false);
    }
  });

  it('documents.keep takes an id, text up to the read cap and a version (or null)', () => {
    expect(accepts('documents.keep', [ID, '', 'v'])).toBe(true);
    expect(accepts('documents.keep', [ID, '', null])).toBe(true);
    for (const bad of [[ID, 'text'], [ID, 'text', ''], [ID, 1, 'v'], ['', 'text', 'v']]) expect(accepts('documents.keep', bad)).toBe(false);
  });

  it('documents.closeAnswer takes one of its three answers', () => {
    for (const answer of ['asking', 'proceed', 'cancel']) expect(accepts('documents.closeAnswer', [answer])).toBe(true);
    for (const bad of [[], ['yes'], [true], ['proceed', 'extra']]) expect(accepts('documents.closeAnswer', bad)).toBe(false);
  });

  it('documents.dirty takes an id and a boolean', () => {
    expect(accepts('documents.dirty', [ID, true])).toBe(true);
    for (const bad of [[ID], [ID, 'yes'], [ID, 1], ['', false], [ID, true, 'extra']]) expect(accepts('documents.dirty', bad)).toBe(false);
  });

  it('documents.resolveImage takes an id and a bounded reference', () => {
    const channel = 'documents.resolveImage';
    expect(accepts(channel, [ID, 'next.md#x'])).toBe(true);
    expect(accepts(channel, [ID, 'x'.repeat(8192)])).toBe(true);
    for (const bad of [[ID], [ID, ''], [ID, 'x'.repeat(8193)], [ID, 7], ['', 'a.md'], [ID, 'a.md', 'extra']]) {
      expect(accepts(channel, bad)).toBe(false);
    }
  });

  it('documents.followLink takes an id, a bounded reference and where to open it', () => {
    const channel = 'documents.followLink';
    expect(accepts(channel, [ID, 'next.md#x', 'current'])).toBe(true);
    expect(accepts(channel, [ID, 'x'.repeat(8192), 'background'])).toBe(true);
    for (const bad of [
      [ID, 'a.md'],
      [ID, '', 'current'],
      [ID, 'x'.repeat(8193), 'current'],
      [ID, 'a.md', 'window'],
      ['', 'a.md', 'current'],
      [ID, 'a.md', 'current', 'extra'],
    ]) {
      expect(accepts(channel, bad)).toBe(false);
    }
  });

  it('documents.setEncoding takes an id and an offered encoding, or null', () => {
    expect(accepts('documents.setEncoding', [ID, 'windows-1252'])).toBe(true);
    expect(accepts('documents.setEncoding', [ID, null])).toBe(true);
    for (const bad of [[ID], [ID, 'utf-32le'], [ID, 'latin1'], [ID, 'UTF-8'], ['', 'utf-8'], [ID, 'utf-8', 'x']]) {
      expect(accepts('documents.setEncoding', bad)).toBe(false);
    }
  });

  it('tabs.zoom takes an id and a zoom from 50 % to 300 %', () => {
    expect(accepts('tabs.zoom', [ID, 0.5])).toBe(true);
    expect(accepts('tabs.zoom', [ID, 3])).toBe(true);
    for (const bad of [[ID], [ID, 0.4], [ID, 3.1], [ID, '1'], [ID, Number.NaN], [ID, 1, 'x']]) {
      expect(accepts('tabs.zoom', bad)).toBe(false);
    }
  });

  it('tabs.width takes an id and a width from 40 to 200 ch, full width, or null', () => {
    for (const good of [[ID, 40], [ID, 200], [ID, 'full'], [ID, null]]) expect(accepts('tabs.width', good)).toBe(true);
    for (const bad of [[ID], [ID, 39], [ID, 201], [ID, 72.5], [ID, '72'], [ID, 'wide'], [ID, Number.NaN], [ID, 72, 'x']]) {
      expect(accepts('tabs.width', bad)).toBe(false);
    }
  });

  it('settings.fonts takes nothing', () => {
    expect(accepts('settings.fonts', [])).toBe(true);
    expect(accepts('settings.fonts', ['--all'])).toBe(false);
  });

  it('tabs.move takes an id and a position', () => {
    expect(accepts('tabs.move', [ID, 0])).toBe(true);
    expect(accepts('tabs.move', [ID, 9999])).toBe(true);
    for (const bad of [[ID], [ID, -1], [ID, 1.5], [ID, 10_000], [ID, '1'], ['', 0], [ID, 0, 'extra']]) {
      expect(accepts('tabs.move', bad)).toBe(false);
    }
  });

  it('tab moves take an id, and where to: a position, a window id or a new window (ADR-019); a drag, its token (ADR-022)', () => {
    const TOKEN = '7d1f9a2b-3c4e-4f5a-8b6c-9d0e1f2a3b4c';
    expect(accepts('tabs.dragStart', [ID, TOKEN])).toBe(true);
    expect(accepts('tabs.dragEnd', [ID, true])).toBe(true);
    expect(accepts('tabs.windows', [])).toBe(true);
    expect(accepts('tabs.adopt', [TOKEN, 0])).toBe(true);
    expect(accepts('tabs.moveTo', [ID, 7])).toBe(true);
    expect(accepts('tabs.moveTo', [ID, 'new'])).toBe(true);
    for (const bad of [[], [''], [ID], [ID, 'not-a-token'], [ID, TOKEN, 'extra']]) {
      expect(accepts('tabs.dragStart', bad)).toBe(false);
    }
    for (const bad of [[], [ID], [ID, 'yes'], ['', false], [ID, true, 'extra']]) expect(accepts('tabs.dragEnd', bad)).toBe(false);
    expect(accepts('tabs.windows', [1])).toBe(false);
    for (const bad of [[TOKEN], [TOKEN, -1], [TOKEN, 1.5], [TOKEN, 10_000], [TOKEN, 'new'], ['tab-1', 0]]) expect(accepts('tabs.adopt', bad)).toBe(false);
    for (const bad of [[ID], [ID, 0], [ID, -3], [ID, 1.5], [ID, 'old'], [ID, '7'], ['', 7], [ID, 7, 'extra']]) {
      expect(accepts('tabs.moveTo', bad)).toBe(false);
    }
  });

  it('tab search takes a bounded query; reopening a closed tab takes one id (UX F16)', () => {
    expect(accepts('tabs.search', [''])).toBe(true);
    expect(accepts('tabs.search', ['x'.repeat(1024)])).toBe(true);
    for (const bad of [[], ['x'.repeat(1025)], [1], ['a', 'b']]) expect(accepts('tabs.search', bad)).toBe(false);
    expect(accepts('tabs.reopenClosedTab', [ID])).toBe(true);
    for (const bad of [[], [''], [1], ['x'.repeat(65)], [ID, ID]]) expect(accepts('tabs.reopenClosedTab', bad)).toBe(false);
  });

  it('tabs.rendered takes an id and a whole, bounded weight', () => {
    expect(accepts('tabs.rendered', [ID, 0])).toBe(true);
    expect(accepts('tabs.rendered', [ID, 2 ** 31])).toBe(true);
    for (const bad of [[ID], [ID, -1], [ID, 0.5], [ID, 2 ** 31 + 1], [ID, '1'], [ID, 1, 'x']]) {
      expect(accepts('tabs.rendered', bad)).toBe(false);
    }
  });

  it('tabs.position takes an id and a scroll anchor with bounded fields and nothing else', () => {
    const at = { line: 12, offset: -3.5, heading: 'user-content-goals', fraction: 0.25 };
    expect(accepts('tabs.position', [ID, at])).toBe(true);
    expect(accepts('tabs.position', [ID, { ...at, heading: null }])).toBe(true);
    for (const bad of [
      { ...at, line: 0 },
      { ...at, line: 1.5 },
      { ...at, offset: Number.POSITIVE_INFINITY },
      { ...at, fraction: 1.01 },
      { ...at, heading: '' },
      { ...at, heading: 'x'.repeat(257) },
      { ...at, extra: true },
      { line: 1, offset: 0, fraction: 0 },
    ]) {
      expect(accepts('tabs.position', [ID, bad])).toBe(false);
    }
  });

  it('tabs.viewState takes an id and a view state with only a view and a follow flag', () => {
    expect(accepts('tabs.viewState', [ID, {}])).toBe(true);
    expect(accepts('tabs.viewState', [ID, { view: 'source', follow: true }])).toBe(true);
    expect(accepts('tabs.viewState', [ID, { view: 'rendered' }])).toBe(true);
    for (const bad of [[ID], [ID, { view: 'raw' }], [ID, { follow: 'yes' }], [ID, { follow: false }], [ID, { extra: 1 }], ['', {}], [ID, {}, 'x']]) {
      expect(accepts('tabs.viewState', bad)).toBe(false);
    }
  });

  it('tabs.viewState takes table options: a known separator, a header flag and "show as table" (ADR-021)', () => {
    expect(accepts('tabs.viewState', [ID, { table: { separator: '|', header: false } }])).toBe(true);
    expect(accepts('tabs.viewState', [ID, { table: { separator: 'auto', asTable: true } }])).toBe(true);
    expect(accepts('tabs.viewState', [ID, { table: {} }])).toBe(true);
    for (const bad of [{ table: { separator: ':' } }, { table: { header: 'no' } }, { table: { asTable: false } }, { table: { extra: 1 } }, { table: 'csv' }]) {
      expect(accepts('tabs.viewState', [ID, bad]), JSON.stringify(bad)).toBe(false);
    }
  });

  it('quick open takes a bounded token, a bounded query, an offered id and where to open it', () => {
    expect(accepts('quickOpen.start', [])).toBe(true);
    expect(accepts('quickOpen.start', ['/r'])).toBe(false);
    expect(accepts('quickOpen.query', ['1:1', ''])).toBe(true);
    expect(accepts('quickOpen.query', ['1:1', 'x'.repeat(4096)])).toBe(true);
    for (const bad of [['1:1'], ['', 'plan'], ['1:1', 'x'.repeat(4097)], ['1:1', 7], ['x'.repeat(65), 'plan']]) {
      expect(accepts('quickOpen.query', bad)).toBe(false);
    }
    expect(accepts('quickOpen.open', ['1:1', ID, true])).toBe(true);
    for (const bad of [['1:1', ID], ['1:1', '', false], ['1:1', ID, 'yes'], ['1:1', ID, false, 'x']]) {
      expect(accepts('quickOpen.open', bad)).toBe(false);
    }
    expect(accepts('quickOpen.close', ['1:1'])).toBe(true);
    expect(accepts('quickOpen.close', [])).toBe(false);
  });

  it('session.restorePrevious takes a snapshot number from 1 to 3', () => {
    expect(accepts('session.restorePrevious', [1])).toBe(true);
    expect(accepts('session.restorePrevious', [3])).toBe(true);
    for (const bad of [[], [0], [4], [1.5], ['1'], [1, 2]]) expect(accepts('session.restorePrevious', bad)).toBe(false);
  });

  it.each(['tabs.snapshot', 'tabs.reopenClosed', 'settings.get', 'session.previous', 'recent.list', 'recent.clear'] as const)('%s takes nothing', (channel) => {
    expect(accepts(channel, [])).toBe(true);
    expect(accepts(channel, [ID])).toBe(false);
  });
});

describe('profile channel arguments', () => {
  it.each(['profiles.create', 'profiles.update'] as const)('%s takes a bounded name and any #rrggbb accent, or none', (channel) => {
    expect(accepts(channel, ['Acme', '#2f9e44'])).toBe(true);
    // A colour hand-edited into profile.json is kept when only the name changes.
    expect(accepts(channel, ['Acme', '#ABCDEF'])).toBe(true);
    expect(accepts(channel, ['Acme', null])).toBe(true);
    for (const bad of [['Acme', 'red'], ['Acme', '#abc'], ['Acme', '#2f9e44; x'], ['x'.repeat(257), null], [7, null], ['Acme']]) {
      expect(accepts(channel, bad)).toBe(false);
    }
  });
});

describe('settings, profile and app channel arguments (SR-11)', () => {
  it('settings.set takes a scope and known settings in range, nothing else', () => {
    expect(accepts('settings.set', ['profile', { fontSize: 20 }])).toBe(true);
    expect(accepts('settings.set', ['global', { tableSeparator: ';', tableHeader: false }])).toBe(true);
    expect(accepts('settings.set', ['global', { tableSeparator: 'semicolon' }])).toBe(false);
    expect(accepts('settings.set', ['global', { themeMode: 'dark', quickOpenExclude: ['dist'] }])).toBe(true);
    for (const bad of [
      ['profile', { fontSize: 9 }],
      ['profile', { fontSize: 41 }],
      ['profile', { themeMode: 'blue' }],
      ['profile', { unknown: 1 }],
      // An own `__proto__` key, as parsed JSON (and IPC data) can carry.
      ['profile', JSON.parse('{"__proto__": {"fontSize": 20}}')],
      ['everyone', { fontSize: 20 }],
      ['profile'],
      ['profile', { fontSize: 20 }, 'extra'],
    ]) {
      expect(accepts('settings.set', bad)).toBe(false);
    }
  });

  it('settings.reset takes the name of a setting only', () => {
    expect(accepts('settings.reset', ['fontSize'])).toBe(true);
    for (const bad of [['toString'], ['__proto__'], [''], [1], []]) expect(accepts('settings.reset', bad)).toBe(false);
  });

  it('settings.openCustomCss takes a scope, settings.openNoticeFile a small index: never a path', () => {
    expect(accepts('settings.openCustomCss', ['profile'])).toBe(true);
    expect(accepts('settings.openCustomCss', ['/etc/passwd'])).toBe(false);
    expect(accepts('settings.openNoticeFile', [0])).toBe(true);
    for (const bad of [[-1], [1.5], [101], ['/cfg/settings.json'], []]) expect(accepts('settings.openNoticeFile', bad)).toBe(false);
  });

  it('profiles.open and profiles.undoCreate take a bounded id or token', () => {
    expect(accepts('profiles.open', ['acme'])).toBe(true);
    expect(accepts('profiles.undoCreate', [ID])).toBe(true);
    for (const channel of ['profiles.open', 'profiles.undoCreate'] as const) {
      for (const bad of [[''], ['x'.repeat(65)], [7], []]) expect(accepts(channel, bad)).toBe(false);
    }
  });

  it.each(['profiles.list', 'profiles.delete', 'profiles.created', 'tabs.openSettings', 'app.installLauncher', 'window.retryAfterCrashes'] as const)('%s takes nothing', (channel) => {
    expect(accepts(channel, [])).toBe(true);
    expect(accepts(channel, ['acme'])).toBe(false);
  });

  it('window.command takes a window command only, never a capability', () => {
    for (const command of ['newWindow', 'closeWindow', 'quit', 'fullScreen']) expect(accepts('window.command', [command])).toBe(true);
    for (const bad of [['editMode'], ['reload'], ['toString'], [], ['quit', 'extra'], [1]]) expect(accepts('window.command', bad)).toBe(false);
  });
});
