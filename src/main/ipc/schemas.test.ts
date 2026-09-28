import { describe, expect, it } from 'vitest';
import { requestSchemas } from '../../shared/contracts/schemas';

const ID = '0b6c1d2e-8f1a-4c3b-9d4e-5f6a7b8c9d0e';
const accepts = (channel: keyof typeof requestSchemas, args: unknown[]) => requestSchemas[channel].safeParse(args).success;

describe('document channel arguments (SR-11)', () => {
  it.each(['documents.read', 'documents.back', 'documents.forward'] as const)('%s takes one document id', (channel) => {
    expect(accepts(channel, [ID])).toBe(true);
    for (const bad of [[], [''], ['x'.repeat(65)], [42], [null], [{ id: ID }], [ID, 'extra']]) {
      expect(accepts(channel, bad)).toBe(false);
    }
  });

  it.each(['documents.followLink', 'documents.resolveImage'] as const)('%s takes an id and a bounded reference', (channel) => {
    expect(accepts(channel, [ID, 'next.md#x'])).toBe(true);
    expect(accepts(channel, [ID, 'x'.repeat(8192)])).toBe(true);
    for (const bad of [[ID], [ID, ''], [ID, 'x'.repeat(8193)], [ID, 7], ['', 'a.md'], [ID, 'a.md', 'extra']]) {
      expect(accepts(channel, bad)).toBe(false);
    }
  });

  it('documents.list takes nothing', () => {
    expect(accepts('documents.list', [])).toBe(true);
    expect(accepts('documents.list', [ID])).toBe(false);
  });
});
