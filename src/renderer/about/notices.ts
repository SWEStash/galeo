import type notices from 'virtual:licences';

export type Notices = typeof notices;

/** The third-party notices: generated at build time, loaded only when the About dialog opens. */
export function loadNotices(): Promise<Notices> {
  return import('virtual:licences').then((module) => module.default);
}
