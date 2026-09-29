import { describe, expect, it } from 'vitest';
import { route, type RouteWorld } from './router';

const profiles = [
  { id: 'default', name: 'default' },
  { id: 'acme', name: 'Acme' },
  { id: 'beta', name: 'Beta' },
];

/** default has windows 1 and 2, acme has 3; 3 was focused last, then 1. beta is stopped. */
const running: RouteWorld = {
  profiles,
  windows: [
    { id: 1, profile: 'default' },
    { id: 2, profile: 'default' },
    { id: 3, profile: 'acme' },
  ],
  focusOrder: [3, 1, 2],
  lastProfile: 'acme',
};

const none: RouteWorld = { profiles, windows: [], focusOrder: [], lastProfile: null };

const request = (over: Partial<{ profile: string | null; newWindow: boolean }> = {}) => ({
  profile: null,
  newWindow: false,
  ...over,
});

describe('route without a profile', () => {
  it('targets the last focused window of any profile', () => {
    expect(route(request(), running)).toEqual({ kind: 'route', profile: 'acme', create: null, start: false, window: 3 });
  });

  it('opens a new window in that window’s profile with --new-window', () => {
    expect(route(request({ newWindow: true }), running)).toEqual({
      kind: 'route',
      profile: 'acme',
      create: null,
      start: false,
      window: 'new',
    });
  });

  it('starts the last-used profile when no window is open', () => {
    expect(route(request(), { ...none, lastProfile: 'beta' })).toEqual({
      kind: 'route',
      profile: 'beta',
      create: null,
      start: true,
      window: 'front',
    });
  });

  it('starts default when no profile was used yet', () => {
    expect(route(request(), none)).toEqual({ kind: 'route', profile: 'default', create: null, start: true, window: 'front' });
  });

  it('starts default when the last-used profile is gone', () => {
    expect(route(request(), { ...none, lastProfile: 'deleted' })).toMatchObject({ profile: 'default', start: true });
  });

  it('starts the last-used profile in a new window with --new-window', () => {
    expect(route(request({ newWindow: true }), { ...none, lastProfile: 'beta' })).toEqual({
      kind: 'route',
      profile: 'beta',
      create: null,
      start: true,
      window: 'new',
    });
  });

  it('falls back to any open window when none was focused yet', () => {
    expect(route(request(), { ...running, focusOrder: [] })).toMatchObject({ profile: 'default', window: 1, start: false });
  });
});

describe('route with --profile', () => {
  it('targets the running profile’s last focused window', () => {
    expect(route(request({ profile: 'default' }), running)).toEqual({
      kind: 'route',
      profile: 'default',
      create: null,
      start: false,
      window: 1,
    });
  });

  it('matches the profile by name', () => {
    expect(route(request({ profile: 'ACME' }), running)).toMatchObject({ profile: 'acme', window: 3 });
  });

  it('opens a new window in a running profile with --new-window', () => {
    expect(route(request({ profile: 'default', newWindow: true }), running)).toMatchObject({
      profile: 'default',
      start: false,
      window: 'new',
    });
  });

  it('starts a stopped profile, restoring it, and targets its front window', () => {
    expect(route(request({ profile: 'beta' }), running)).toEqual({
      kind: 'route',
      profile: 'beta',
      create: null,
      start: true,
      window: 'front',
    });
  });

  it('starts a stopped profile and adds a new window with --new-window', () => {
    expect(route(request({ profile: 'beta', newWindow: true }), running)).toMatchObject({ start: true, window: 'new' });
  });

  it('creates an unknown profile and starts it', () => {
    expect(route(request({ profile: 'Gamma' }), running)).toEqual({
      kind: 'route',
      profile: 'gamma',
      create: 'Gamma',
      start: true,
      window: 'front',
    });
  });

  it('refuses an unusable profile name', () => {
    expect(route(request({ profile: 'x\u0000' }), running)).toEqual({ kind: 'invalid', reason: 'control-character' });
  });
});
