import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import githubDark from 'shiki/themes/github-dark.mjs';
import githubLight from 'shiki/themes/github-light.mjs';
import { LINE_TINT } from '../../../src/renderer/document/log-view';
import { DARK_PIE } from '../../../src/renderer/document/mermaid-engine';
import { CODE_COLOR_REPLACEMENTS } from '../../../src/renderer/worker/pipeline/highlighter';
import { ACCENTS } from '../../../src/shared/accents';
import { contrast } from '../../helpers/contrast';

const css = readFileSync(path.resolve(import.meta.dirname, '../../../src/renderer/styles/tokens.css'), 'utf8');

/** The `--galeo-color-*` (by name) and `--galeo-syntax-*` (`syntax-` + name) hex values a rule block of tokens.css sets. */
function colours(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...block.matchAll(/--galeo-(?:color-)?([a-z-]+):\s*(#[0-9a-f]{6})\s*;/g)].map(([, name, value]) => [name, value]));
}

const light = colours(':root');
const SCHEMES = { light, dark: { ...light, ...colours(":root[data-scheme='dark']") } };
// What text and controls sit on: the page, and the tab bar, code blocks and panels (`code-bg`).
const SURFACES = ['bg', 'code-bg'] as const;

describe.each(Object.entries(SCHEMES))('the %s theme (UX §6, WCAG 2.1 AA)', (_scheme, tokens) => {
  it.each(['fg', 'muted', 'link', 'log-error', 'log-warn', 'log-info'])('%s text reads at 4.5:1 or more', (token) => {
    for (const surface of SURFACES) expect(contrast(tokens[token]!, tokens[surface]!), `${token} on ${surface}`).toBeGreaterThanOrEqual(4.5);
  });

  it('source highlighting reads at 4.5:1 or more, for every syntax colour', () => {
    const syntax = Object.keys(tokens).filter((token) => token.startsWith('syntax-'));
    expect(syntax).toHaveLength(8);
    for (const token of syntax) for (const surface of SURFACES) expect(contrast(tokens[token]!, tokens[surface]!), `${token} on ${surface}`).toBeGreaterThanOrEqual(4.5);
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


/** `color-mix(in srgb, colour percent%, transparent)` drawn over `surface`. */
function tint(colour: string, percent: number, surface: string): string {
  const channel = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16);
  const mixed = [1, 3, 5].map((at) => Math.round((channel(colour, at) * percent + channel(surface, at) * (100 - percent)) / 100));
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

describe.each(Object.entries(SCHEMES))('log lines in the %s theme (WCAG 2.1 AA)', (_scheme, tokens) => {
  it.each(Object.keys(LINE_TINT) as (keyof typeof LINE_TINT)[])('every colour reads at 4.5:1 on a tinted %s line', (level) => {
    const line = tint(tokens[`log-${level}`]!, LINE_TINT[level], tokens['bg']!);
    // The text, its timestamp, its keys and its own level word.
    for (const token of ['fg', 'muted', 'syntax-constant', `log-${level}`]) {
      expect(contrast(tokens[token]!, line), `${token} on ${line}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('the JSON tree (UX F14): colours from the checked tokens, as the JSON source view', () => {
  const documentCss = readFileSync(path.resolve(import.meta.dirname, '../../../src/renderer/document/document.css'), 'utf8');
  const colourOf = (type: string) => new RegExp(`\\.galeo-json-${type}\\b[^{]*\\{[^}]*?\\bcolor:\\s*var\\(--galeo-(?:color-)?([a-z-]+)\\)`).exec(documentCss)?.[1];

  it.each([
    ['key', 'syntax-constant'],
    ['number', 'syntax-constant'],
    ['true', 'syntax-constant'],
    ['false', 'syntax-constant'],
    ['null', 'syntax-constant'],
    ['string', 'syntax-string'],
    ['object', 'muted'],
    ['array', 'muted'],
  ])('%s is %s', (type, token) => {
    expect(colourOf(type)).toBe(token);
    for (const tokens of Object.values(SCHEMES)) expect(tokens[token], token).toBeDefined();
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
