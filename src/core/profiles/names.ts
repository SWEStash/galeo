/** A profile as `--profile` sees it: the stable id (a folder name) and the display name (ADR-005). */
export interface ProfileName {
  id: string;
  name: string;
}

export type NameProblem = 'empty' | 'too-long' | 'control-character';

export type Resolved =
  | { kind: 'existing'; id: string }
  | { kind: 'create'; id: string; name: string }
  | { kind: 'invalid'; reason: NameProblem };

const ID_MAX = 32;
const NAME_MAX = 64;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Control characters and the bidi overrides that could make a name read as something else.
const UNSAFE = /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u;

/** Ids are the only part of a profile ever joined into a path, so this is all they may be. */
export function isProfileId(value: string): boolean {
  return value.length <= ID_MAX && ID_PATTERN.test(value);
}

export function validateName(value: string): { ok: true; name: string } | { ok: false; reason: NameProblem } {
  const name = value.trim();
  if (name.length === 0) return { ok: false, reason: 'empty' };
  if (name.length > NAME_MAX) return { ok: false, reason: 'too-long' };
  if (UNSAFE.test(name)) return { ok: false, reason: 'control-character' };
  return { ok: true, name };
}

/** A fresh id for a new profile named `name`: its ASCII slug, numbered when `taken` has it. */
export function profileIdFor(name: string, taken: readonly string[]): string {
  const base = slug(name) || 'profile';
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const id = `${trimDashes(base.slice(0, ID_MAX - suffix.length))}${suffix}`;
    if (!taken.includes(id)) return id;
  }
}

/** `--profile X`: an id first, then a name ignoring case; anything else is a profile to create. */
export function resolveProfile(query: string, profiles: readonly ProfileName[]): Resolved {
  const byId = profiles.find((profile) => profile.id === query);
  if (byId) return { kind: 'existing', id: byId.id };
  const valid = validateName(query);
  if (!valid.ok) return { kind: 'invalid', reason: valid.reason };
  const wanted = valid.name.toLowerCase();
  const byName = profiles.find((profile) => profile.name.toLowerCase() === wanted);
  if (byName) return { kind: 'existing', id: byName.id };
  return { kind: 'create', id: profileIdFor(valid.name, profiles.map((profile) => profile.id)), name: valid.name };
}

function slug(name: string): string {
  const ascii = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  return trimDashes(trimDashes(ascii).slice(0, ID_MAX));
}

function trimDashes(value: string): string {
  return value.replace(/^-+|-+$/g, '');
}
