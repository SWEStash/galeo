import { z, type ZodType } from 'zod';
import { WINDOW_COMMANDS } from '../keymap';
import type { SettingsOverrides } from '../settings';
import { CHOSEN_ENCODINGS, type AnyChannel, type Requests } from './ipc';

/**
 * Argument schemas for every renderer → main channel. Imported by main only (SR-11), and kept out
 * of `index.ts` so the preload and renderer never reach zod.
 */
const documentId = z.string().min(1).max(64);

/** Where a tab is scrolled (ADR-002); also stored in sessions. */
export const scrollAnchor = z.strictObject({
  line: z.int().min(1).max(100_000_000),
  offset: z.number().min(-1e7).max(1e7),
  heading: z.string().min(1).max(256).nullable(),
  fraction: z.number().min(0).max(1),
});

const profileId = z.string().min(1).max(32);
const profileName = z.string().max(256);
// Any colour `profile.json` may hold: the dialogs offer presets, and a hand-picked one survives a rename.
const accent = z.string().regex(/^#[0-9a-f]{6}$/i).nullable();

/** Every setting a file or the Settings tab may set (SR-17), each optional. */
export const settingsOverrides = z.strictObject({
  themeMode: z.enum(['system', 'light', 'dark']),
  proseFont: z.string().min(1).max(100),
  codeFont: z.string().min(1).max(100),
  fontSize: z.int().min(10).max(40),
  measure: z.int().min(40).max(200),
  statusBar: z.boolean(),
  quickOpenExclude: z.array(z.string().min(1).max(255)).max(1000),
  warmTabs: z.int().min(0).max(20),
  warmMegabytes: z.int().min(1).max(1024),
}).partial();

/** A tab's zoom, 50 % to 300 %. */
export const zoomLevel = z.number().min(0.5).max(3);
const quickOpenToken = z.string().min(1).max(64);
/** A tab's chosen view and follow state; only what differs from the defaults is ever set. */
export const tabViewState = z.strictObject({ view: z.enum(['rendered', 'source']).exactOptional(), follow: z.literal(true).exactOptional() });

export const requestSchemas: { [C in AnyChannel]: ZodType<Requests[C]> } = {
  'app.info': z.tuple([]),
  'app.resolveSandboxUnavailable': z.tuple([z.enum(['quit', 'run-unsandboxed'])]),
  'app.installLauncher': z.tuple([]),
  'documents.read': z.tuple([documentId]),
  'documents.setEncoding': z.tuple([documentId, z.enum(CHOSEN_ENCODINGS).nullable()]),
  'documents.followLink': z.tuple([documentId, z.string().min(1).max(8192), z.enum(['current', 'background'])]),
  'documents.back': z.tuple([documentId]),
  'documents.forward': z.tuple([documentId]),
  'documents.resolveImage': z.tuple([documentId, z.string().min(1).max(8192)]),
  'documents.pathMenu': z.tuple([documentId]),
  'documents.contextMenu': z.tuple([documentId]),
  'tabs.snapshot': z.tuple([]),
  'tabs.activated': z.tuple([documentId]),
  'tabs.rendering': z.tuple([documentId]),
  'tabs.rendered': z.tuple([documentId, z.int().min(0).max(2 ** 31)]),
  'tabs.renderAgain': z.tuple([documentId]),
  'tabs.position': z.tuple([documentId, scrollAnchor]),
  'tabs.zoom': z.tuple([documentId, zoomLevel]),
  'tabs.viewState': z.tuple([documentId, tabViewState]),
  'tabs.close': z.tuple([documentId]),
  'tabs.reopenClosed': z.tuple([]),
  'tabs.move': z.tuple([documentId, z.int().min(0).max(9999)]),
  'settings.get': z.tuple([]),
  'session.previous': z.tuple([]),
  'session.restorePrevious': z.tuple([z.int().min(1).max(3)]),
  'recent.list': z.tuple([]),
  'recent.open': z.tuple([documentId]),
  'recent.clear': z.tuple([]),
  'drops.register': z.tuple([z.array(z.string().min(1).max(32_767)).min(1).max(1000)]),
  'drops.open': z.tuple([z.string().min(1).max(64), z.strictObject({ after: documentId.nullable().exactOptional() })]),
  'quickOpen.start': z.tuple([]),
  'quickOpen.query': z.tuple([quickOpenToken, z.string().max(4096)]),
  'quickOpen.open': z.tuple([quickOpenToken, documentId, z.boolean()]),
  'quickOpen.close': z.tuple([quickOpenToken]),
  'profiles.created': z.tuple([]),
  'profiles.undoCreate': z.tuple([documentId]),
  'profiles.list': z.tuple([]),
  'profiles.open': z.tuple([profileId]),
  // Names are checked by main's own rules; this only bounds them.
  'profiles.create': z.tuple([profileName, accent]),
  'profiles.update': z.tuple([profileName, accent]),
  'profiles.delete': z.tuple([]),
  'settings.set': z.tuple([z.enum(['global', 'profile']), settingsOverrides as ZodType<SettingsOverrides>]),
  'settings.reset': z.tuple([z.enum(Object.keys(settingsOverrides.shape) as [keyof typeof settingsOverrides.shape, ...(keyof typeof settingsOverrides.shape)[]])]),
  'settings.openCustomCss': z.tuple([z.enum(['global', 'profile'])]),
  'settings.openNoticeFile': z.tuple([z.int().min(0).max(100)]),
  'tabs.openSettings': z.tuple([]),
  'window.command': z.tuple([z.enum(WINDOW_COMMANDS)]),
};
