import { describe, expect, it } from 'vitest';
import { requestSchemas } from '../../shared/contracts/schemas';

const ID = '0b6c1d2e-8f1a-4c3b-9d4e-5f6a7b8c9d0e';
const accepts = (channel: keyof typeof requestSchemas, args: unknown[]) => requestSchemas[channel].safeParse(args).success;

describe('document channel arguments (SR-11)', () => {
  it.each(['documents.read', 'documents.back', 'documents.forward', 'documents.pathMenu', 'documents.contextMenu', 'recent.open', 'tabs.activated', 'tabs.close'] as const)('%s takes one document id', (channel) => {
    expect(accepts(channel, [ID])).toBe(true);
    for (const bad of [[], [''], ['x'.repeat(65)], [42], [null], [{ id: ID }], [ID, 'extra']]) {
      expect(accepts(channel, bad)).toBe(false);
    }
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

  it('tabs.move takes an id and a position', () => {
    expect(accepts('tabs.move', [ID, 0])).toBe(true);
    expect(accepts('tabs.move', [ID, 9999])).toBe(true);
    for (const bad of [[ID], [ID, -1], [ID, 1.5], [ID, 10_000], [ID, '1'], ['', 0], [ID, 0, 'extra']]) {
      expect(accepts('tabs.move', bad)).toBe(false);
    }
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
