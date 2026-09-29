import { DEFAULT_PROFILE } from '../profiles/catalog';
import { resolveProfile, type NameProblem, type ProfileName } from '../profiles/names';

/** What a launch asks for, once its arguments are parsed. Files don't change the target. */
export interface RouteRequest {
  profile: string | null;
  newWindow: boolean;
}

/** What main knows when a request arrives. A profile runs while it has a window (ADR-005). */
export interface RouteWorld {
  profiles: readonly ProfileName[];
  windows: readonly { id: number; profile: string }[];
  /** Window ids, the last focused first, across all profiles. */
  focusOrder: readonly number[];
  /** The profile last worked in (`app-state.json`), if any. */
  lastProfile: string | null;
}

/**
 * Where a request's files go. `start`: the profile isn't running, so its session is restored
 * first; `'front'` is then its front window. `create` names a profile made for this request.
 */
export type Route =
  | { kind: 'route'; profile: string; create: string | null; start: boolean; window: number | 'new' | 'front' }
  | { kind: 'invalid'; reason: NameProblem };

/** The ADR-005 routing rules. Nothing here raises a window; main never steals focus. */
export function route(request: RouteRequest, world: RouteWorld): Route {
  if (request.profile !== null) {
    const resolved = resolveProfile(request.profile, world.profiles);
    if (resolved.kind === 'invalid') return resolved;
    const create = resolved.kind === 'create' ? resolved.name : null;
    return target(resolved.id, create, request.newWindow, world);
  }
  const last = lastFocused(world, () => true);
  if (last) return target(last.profile, null, request.newWindow, world);
  const known = world.profiles.some((profile) => profile.id === world.lastProfile);
  return target(known && world.lastProfile ? world.lastProfile : DEFAULT_PROFILE, null, request.newWindow, world);
}

function target(profile: string, create: string | null, newWindow: boolean, world: RouteWorld): Route {
  const window = lastFocused(world, (candidate) => candidate.profile === profile);
  if (!window) return { kind: 'route', profile, create, start: true, window: newWindow ? 'new' : 'front' };
  return { kind: 'route', profile, create, start: false, window: newWindow ? 'new' : window.id };
}

/** The matching window focused most recently, or the first open one that was never focused. */
function lastFocused(world: RouteWorld, matches: (window: RouteWorld['windows'][number]) => boolean) {
  const candidates = world.windows.filter(matches);
  for (const id of world.focusOrder) {
    const window = candidates.find((candidate) => candidate.id === id);
    if (window) return window;
  }
  return candidates[0];
}
