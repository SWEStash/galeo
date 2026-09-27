import { useLayoutEffect, useState } from 'react';
import type { ColorScheme } from './host';

/** The part of `MediaQueryList` the watcher needs. */
export interface SchemeQuery extends EventTarget {
  readonly matches: boolean;
}

/**
 * Follows `(prefers-color-scheme: dark)`. Chromium keeps it in sync with the desktop's dark-style
 * setting (and with main's `nativeTheme.themeSource`), so a system change applies live.
 */
export function watchColorScheme(query: SchemeQuery, onChange: (scheme: ColorScheme) => void): () => void {
  const report = () => onChange(query.matches ? 'dark' : 'light');
  report();
  query.addEventListener('change', report);
  return () => query.removeEventListener('change', report);
}

const DARK = '(prefers-color-scheme: dark)';

/**
 * The app's colour scheme, applied to the root element (the tokens switch on it) before paint,
 * so a dark desktop never sees a light first frame.
 */
export function useColorScheme(): ColorScheme {
  const [scheme, setScheme] = useState<ColorScheme>(() => (matchMedia(DARK).matches ? 'dark' : 'light'));
  useLayoutEffect(() => watchColorScheme(matchMedia(DARK), setScheme), []);
  useLayoutEffect(() => {
    document.documentElement.dataset['scheme'] = scheme;
  }, [scheme]);
  return scheme;
}
