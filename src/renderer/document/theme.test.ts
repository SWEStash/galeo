import { describe, expect, it, vi } from 'vitest';
import { schemeFor } from '../../shared/settings';
import { watchColorScheme, type SchemeQuery } from './theme';

class FakeQuery extends EventTarget implements SchemeQuery {
  constructor(public matches: boolean) {
    super();
  }
  flip(matches: boolean) {
    this.matches = matches;
    this.dispatchEvent(new Event('change'));
  }
}

describe('watchColorScheme', () => {
  it('reports the current scheme at once', () => {
    const onChange = vi.fn();
    watchColorScheme(new FakeQuery(true), onChange);
    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('follows the system preference live', () => {
    const query = new FakeQuery(false);
    const onChange = vi.fn();
    watchColorScheme(query, onChange);
    query.flip(true);
    query.flip(false);
    expect(onChange.mock.calls.map(([scheme]) => scheme)).toEqual(['light', 'dark', 'light']);
  });

  it('stops following once unsubscribed', () => {
    const query = new FakeQuery(false);
    const onChange = vi.fn();
    const stop = watchColorScheme(query, onChange);
    stop();
    query.flip(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('schemeFor', () => {
  it("follows the desktop in system mode, and the profile's choice otherwise", () => {
    expect(schemeFor('system', true)).toBe('dark');
    expect(schemeFor('system', false)).toBe('light');
    expect(schemeFor('light', true)).toBe('light');
    expect(schemeFor('dark', false)).toBe('dark');
  });
});
