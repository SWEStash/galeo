import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import githubDark from 'shiki/themes/github-dark.mjs';
import githubLight from 'shiki/themes/github-light.mjs';
import { DARK_PIE } from '../../../src/renderer/document/mermaid-engine';
import { CODE_COLOR_REPLACEMENTS } from '../../../src/renderer/worker/pipeline/highlighter';
import { ACCENTS } from '../../../src/shared/accents';
import { contrast } from '../../helpers/contrast';

const css = readFileSync(path.resolve(import.meta.dirname, '../../../src/renderer/styles/tokens.css'), 'utf8');

/** The `--galeo-color-*` hex values a rule block of tokens.css sets. */
function colours(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...block.matchAll(/--galeo-color-([a-z-]+):\s*(#[0-9a-f]{6})\s*;/g)].map(([, name, value]) => [name, value]));
}

const light = colours(':root');
const SCHEMES = { light, dark: { ...light, ...colours(":root[data-scheme='dark']") } };
// What text and controls sit on: the page, and the tab bar, code blocks and panels (`code-bg`).
const SURFACES = ['bg', 'code-bg'] as const;

describe.each(Object.entries(SCHEMES))('the %s theme (UX §6, WCAG 2.1 AA)', (_scheme, tokens) => {
  it.each(['fg', 'muted', 'link', 'log-error', 'log-warn', 'log-info'])('%s text reads at 4.5:1 or more', (token) => {
    for (const surface of SURFACES) expect(contrast(tokens[token]!, tokens[surface]!), `${token} on ${surface}`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['focus', 'control-border'])('%s, which identifies a control, stands out 3:1 or more', (token) => {
    for (const surface of SURFACES) expect(contrast(tokens[token]!, tokens[surface]!), `${token} on ${surface}`).toBeGreaterThanOrEqual(3);
  });

  it.each(ACCENTS.map((accent) => [accent.name, accent.color]))('the %s accent stands out 3:1 on the tab bar', (_name, color) => {
    expect(contrast(color, tokens['code-bg']!)).toBeGreaterThanOrEqual(3);
  });
});

describe('code highlighting (ADR-003 themes, WCAG 2.1 AA)', () => {
  it.each([
    ['github-light', githubLight, 'light'],
    ['github-dark', githubDark, 'dark'],
  ] as const)('%s text, with our replacements, reads at 4.5:1 or more on code blocks', (name, theme, scheme) => {
    const replaced = CODE_COLOR_REPLACEMENTS[name] as Record<string, string>;
    const background = SCHEMES[scheme]['code-bg']!;
    const foregrounds = new Set(
      (theme.tokenColors ?? []).flatMap((rule) => (rule.settings.foreground ? [rule.settings.foreground.toLowerCase().slice(0, 7)] : [])),
    );
    // Colours the theme uses only as backgrounds (inserted/deleted text, invalid code) aren't text.
    const shown = [...foregrounds].filter((colour) => contrast(colour, background) > 1.5);
    for (const colour of shown) expect(contrast(replaced[colour] ?? colour, background), `${colour} → ${replaced[colour] ?? 'kept'}`).toBeGreaterThanOrEqual(4.5);
  });
});


describe("Mermaid's pie charts in the dark theme (WCAG 2.1 AA)", () => {
  const slices = Array.from({ length: 12 }, (_, n) => DARK_PIE[`pie${n + 1}` as keyof typeof DARK_PIE]);

  it('fills every slice opaquely, so its colour is what shows', () => {
    expect(DARK_PIE.pieOpacity).toBe('1');
  });

  it.each(slices.map((colour, n) => [n + 1, colour]))('slice %i (%s) stands out 3:1 on the page, and its label reads at 4.5:1', (_n, colour) => {
    for (const surface of SURFACES) expect(contrast(colour, SCHEMES.dark[surface]!), `on ${surface}`).toBeGreaterThanOrEqual(3);
    expect(contrast(DARK_PIE.pieSectionTextColor, colour)).toBeGreaterThanOrEqual(4.5);
  });
});
