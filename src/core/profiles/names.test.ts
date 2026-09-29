import { describe, expect, it } from 'vitest';
import { isProfileId, profileIdFor, resolveProfile, validateName } from './names';

describe('profileIdFor', () => {
  it('lower-cases a simple name', () => {
    expect(profileIdFor('Acme', [])).toBe('acme');
  });

  it('turns runs of other characters into single dashes, trimmed at both ends', () => {
    expect(profileIdFor('  Acme Corp! (EU) ', [])).toBe('acme-corp-eu');
  });

  it('drops accents and keeps only ASCII letters and digits', () => {
    expect(profileIdFor('Café Ñandú 2', [])).toBe('cafe-nandu-2');
  });

  it('falls back to "profile" when nothing usable is left', () => {
    expect(profileIdFor('日本語', [])).toBe('profile');
    expect(profileIdFor('../..', [])).toBe('profile');
  });

  it('caps the id at 32 characters without a trailing dash', () => {
    const id = profileIdFor('a'.repeat(31) + ' b c', []);
    expect(id).toBe('a'.repeat(31));
    expect(profileIdFor('x'.repeat(40), [])).toHaveLength(32);
  });

  it('numbers an id that is taken, staying within 32 characters', () => {
    expect(profileIdFor('Acme', ['acme'])).toBe('acme-2');
    expect(profileIdFor('Acme', ['acme', 'acme-2'])).toBe('acme-3');
    expect(profileIdFor('x'.repeat(40), ['x'.repeat(32)])).toBe(`${'x'.repeat(30)}-2`);
  });
});

describe('isProfileId', () => {
  it.each(['default', 'acme', 'acme-corp-2', 'a'.repeat(32)])('accepts %s', (id) => {
    expect(isProfileId(id)).toBe(true);
  });

  it.each(['', 'Acme', '-acme', 'acme-', 'a--b', '../x', 'a/b', 'a\\b', '.', 'a'.repeat(33), 'acme\n'])(
    'refuses %j',
    (id) => {
      expect(isProfileId(id)).toBe(false);
    },
  );
});

describe('validateName', () => {
  it('trims the name', () => {
    expect(validateName('  Acme  ')).toEqual({ ok: true, name: 'Acme' });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['a'.repeat(65), 'too-long'],
    ['Ac\u0000me', 'control-character'],
    ['Ac\nme', 'control-character'],
    ['Ac\u202eme', 'control-character'],
  ])('refuses %j (%s)', (name, reason) => {
    expect(validateName(name)).toEqual({ ok: false, reason });
  });

  it('accepts 64 characters', () => {
    expect(validateName('a'.repeat(64))).toEqual({ ok: true, name: 'a'.repeat(64) });
  });
});

describe('resolveProfile', () => {
  const profiles = [
    { id: 'default', name: 'default' },
    { id: 'acme', name: 'Acme Corp' },
    { id: 'client-2', name: 'acme' },
  ];

  it('matches an id first', () => {
    expect(resolveProfile('acme', profiles)).toEqual({ kind: 'existing', id: 'acme' });
  });

  it('then a name, ignoring case', () => {
    expect(resolveProfile('ACME CORP', profiles)).toEqual({ kind: 'existing', id: 'acme' });
    expect(resolveProfile('Acme', profiles)).toEqual({ kind: 'existing', id: 'client-2' });
  });

  it('matches ids exactly, so an upper-case id is looked up as a name', () => {
    expect(resolveProfile('DEFAULT', profiles)).toEqual({ kind: 'existing', id: 'default' });
    expect(resolveProfile('CLIENT-2', profiles)).toEqual({ kind: 'create', id: 'client-2-2', name: 'CLIENT-2' });
  });

  it('creates an unknown name with a fresh id', () => {
    expect(resolveProfile(' Beta ', profiles)).toEqual({ kind: 'create', id: 'beta', name: 'Beta' });
  });

  it('never turns a path into anything but a plain id', () => {
    expect(resolveProfile('../../etc', profiles)).toEqual({ kind: 'create', id: 'etc', name: '../../etc' });
  });

  it('refuses an unusable name', () => {
    expect(resolveProfile('a\u0007', profiles)).toEqual({ kind: 'invalid', reason: 'control-character' });
  });
});
