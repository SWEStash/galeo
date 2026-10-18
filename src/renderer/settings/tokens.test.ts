import { describe, expect, it } from 'vitest';
import { settingsTokens } from './tokens';

const base = { proseFont: 'Inter', codeFont: 'JetBrains Mono', fontSize: 17, measure: 72 };

describe('settingsTokens', () => {
  it('turns the reading settings into the documented tokens, keeping font fallbacks', () => {
    expect(settingsTokens(base)).toEqual({
      '--galeo-font-prose': "'Inter', system-ui, sans-serif",
      '--galeo-font-code': "'JetBrains Mono', ui-monospace, monospace",
      '--galeo-font-size': '17px',
      '--galeo-measure': '72ch',
    });
  });

  it('gives a full-width measure no column limit', () => {
    expect(settingsTokens({ ...base, measure: 'full' })['--galeo-measure']).toBe('none');
  });

  it('keeps a font name from closing its quotes or adding declarations', () => {
    const tokens = settingsTokens({ ...base, proseFont: "Evil'; } body { display: none } '\\" });
    expect(tokens['--galeo-font-prose']).toBe("'Evil body display: none', system-ui, sans-serif");
  });
});
