import { FONT_NAME_MAX, type SystemFont } from '../../shared/fonts';

/** fc-list's `-f` format: each face's first family name and its spacing, tab-separated, a line each. */
export const FC_LIST_FORMAT = '%{family[0]}\\t%{spacing}\\n';

/** fontconfig spacings with every character the same width: dual (90), mono (100), charcell (110). */
const MONO_SPACINGS = new Set(['90', '100', '110']);
const CONTROL = /\p{Cc}/u;

/**
 * The installed families from fc-list's output, each once, sorted by name. A family is monospace
 * when any of its faces is. Names a setting couldn't hold (empty, too long, control characters)
 * are dropped; anything else is data, which the font tokens escape.
 */
export function parseFontList(output: string): SystemFont[] {
  const families = new Map<string, boolean>();
  for (const line of output.split('\n')) {
    const [name = '', spacing = ''] = line.replace(/\r$/, '').split('\t');
    const family = name.trim();
    if (!family || family.length > FONT_NAME_MAX || CONTROL.test(family)) continue;
    families.set(family, (families.get(family) ?? false) || MONO_SPACINGS.has(spacing.trim()));
  }
  return [...families]
    .map(([family, mono]) => ({ family, mono }))
    .sort((a, b) => a.family.localeCompare(b.family, 'en', { sensitivity: 'base' }));
}
