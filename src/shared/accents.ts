/**
 * The accent colours a profile can pick (UX §6: presets only, so each is known to stand out 3:1
 * on the tab bar in light and dark). The accent is never the only cue: the name is always shown.
 */
export const ACCENTS: readonly { name: string; color: string }[] = [
  { name: 'Blue', color: '#3a7bd5' },
  { name: 'Teal', color: '#0e9384' },
  { name: 'Green', color: '#2f9e44' },
  { name: 'Amber', color: '#c27c0e' },
  { name: 'Orange', color: '#d9622b' },
  { name: 'Red', color: '#d64545' },
  { name: 'Pink', color: '#c2418f' },
  { name: 'Purple', color: '#8b5cf6' },
];

/** A profile's accent: its own (a preset, or a hand-edited colour in profile.json), else the first preset. */
export function accentOf(accent: string | null): string {
  return accent ?? ACCENTS[0]!.color;
}
