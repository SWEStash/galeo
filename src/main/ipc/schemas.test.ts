import { describe, expect, it } from 'vitest';
import { requestSchemas } from '../../shared/contracts/schemas';

const ID = '0b6c1d2e-8f1a-4c3b-9d4e-5f6a7b8c9d0e';
const accepts = (channel: keyof typeof requestSchemas, args: unknown[]) => requestSchemas[channel].safeParse(args).success;

describe('document channel arguments (SR-11)', () => {
  it.each(['documents.read', 'documents.back', 'documents.forward', 'tabs.activated', 'tabs.close'] as const)('%s takes one document id', (channel) => {
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

  it('tabs.move takes an id and a position', () => {
    expect(accepts('tabs.move', [ID, 0])).toBe(true);
    expect(accepts('tabs.move', [ID, 9999])).toBe(true);
    for (const bad of [[ID], [ID, -1], [ID, 1.5], [ID, 10_000], [ID, '1'], ['', 0], [ID, 0, 'extra']]) {
      expect(accepts('tabs.move', bad)).toBe(false);
    }
  });

  it.each(['tabs.snapshot', 'tabs.reopenClosed', 'settings.get'] as const)('%s takes nothing', (channel) => {
    expect(accepts(channel, [])).toBe(true);
    expect(accepts(channel, [ID])).toBe(false);
  });
});
