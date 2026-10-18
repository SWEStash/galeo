import type { Settings } from '../../shared/settings';

/** Characters that could end a quoted font name or the declaration around it. */
const UNSAFE = /['"\\;{}\p{Cc}]/gu;

/** A font setting as a CSS font-family list: the name, quoted and made safe, then `fallback`. */
export function fontStack(name: string, fallback: string): string {
  const safe = name.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim();
  return `'${safe}', ${fallback}`;
}

/** The reading settings (UX §6) as the documented `--galeo-*` tokens, which documents inherit. */
export function settingsTokens(settings: Pick<Settings, 'proseFont' | 'codeFont' | 'fontSize' | 'measure'>): Record<string, string> {
  return {
    '--galeo-font-prose': fontStack(settings.proseFont, 'system-ui, sans-serif'),
    '--galeo-font-code': fontStack(settings.codeFont, 'ui-monospace, monospace'),
    '--galeo-font-size': `${settings.fontSize}px`,
    '--galeo-measure': settings.measure === 'full' ? 'none' : `${settings.measure}ch`,
  };
}
