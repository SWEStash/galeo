import type { InputCredits } from '../../core/documents/input-credits';
import type { UnsavedChanges } from '../../core/documents/unsaved';
import { DEFAULT_PROFILE } from '../../core/profiles/catalog';
import type { ProfileResult, ProfilesState } from '../../shared/contracts';
import type { Handlers } from '../ipc/register';

type ProfileChannels =
  | 'profiles.list'
  | 'profiles.open'
  | 'profiles.create'
  | 'profiles.update'
  | 'profiles.delete'
  | 'profiles.created'
  | 'profiles.undoCreate';

/** What the profile channels need of a running profile. */
interface HandlerProfile {
  id: string;
  windows: readonly { webContents: { id: number } }[];
}

/**
 * The profile menu's channels. Every change runs on the routing queue, after the open requests
 * before it. Deleting a profile spends a credit of real input (T6); an undo is offered only to the
 * window that saw the profile created.
 */
export function profileHandlers<P extends HandlerProfile>(deps: {
  profileOf: (window: number) => P | undefined;
  state: (current: string) => Promise<ProfilesState>;
  profileIds: () => Promise<readonly string[]>;
  enqueue: <T>(task: () => Promise<T>) => Promise<T>;
  open: (profile: string) => Promise<unknown>;
  create: (name: string, accent: string | null) => Promise<ProfileResult>;
  update: (profile: P, name: string, accent: string | null) => Promise<ProfileResult>;
  remove: (profile: string) => Promise<void>;
  /** Profiles a launch created, by undo token. */
  undoable: ReadonlyMap<string, { name: string; window: number }>;
  undo: (token: string) => Promise<void>;
  input: Pick<InputCredits, 'spend'>;
  unsaved: Pick<UnsavedChanges, 'confirm'>;
}): Pick<Handlers, ProfileChannels> {
  const { profileOf, state, profileIds, enqueue, open, create, update, remove, undoable, undo, input, unsaved } = deps;
  return {
    'profiles.list': (_args, event) => state(profileOf(event.sender.id)?.id ?? DEFAULT_PROFILE),
    'profiles.open': async ([id]) => {
      if (!(await profileIds()).includes(id)) throw new Error('no such profile');
      await enqueue(() => open(id));
    },
    'profiles.create': ([name, accent]) => enqueue(() => create(name, accent)),
    'profiles.update': ([name, accent], event) => {
      const profile = profileOf(event.sender.id);
      if (!profile) throw new Error('no profile');
      return enqueue(() => update(profile, name, accent));
    },
    'profiles.delete': async (_args, event) => {
      if (!input.spend(event.sender.id)) throw new Error('no input');
      const profile = profileOf(event.sender.id);
      if (!profile || profile.id === DEFAULT_PROFILE) throw new Error('not deletable');
      if (!(await unsaved.confirm(profile.windows.map((window) => window.webContents.id)))) return;
      return enqueue(() => remove(profile.id));
    },
    'profiles.created': (_args, event) => {
      for (const [token, created] of undoable) if (created.window === event.sender.id) return { name: created.name, token };
      return null;
    },
    'profiles.undoCreate': ([token], event) => {
      if (undoable.get(token)?.window !== event.sender.id) throw new Error('not offered');
      return enqueue(() => undo(token));
    },
  };
}
