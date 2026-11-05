import { describe, expect, it } from 'vitest';
import { checkStylesheet } from './check-styles.mjs';

const found = (css) => checkStylesheet(css).map((f) => `${f.line} ${f.what}`);

describe('checkStylesheet', () => {
  it('accepts tokens, hairlines, percentages, ems and custom property definitions', () => {
    expect(
      found(
        [
          '.a {',
          '  padding: var(--galeo-space-sm) 0;',
          '  margin: -1px 0 1px;',
          '  font: var(--galeo-text-md) var(--galeo-font-ui);',
          '  font-size: 0.85em;',
          '  border: 1px solid var(--galeo-color-border);',
          '  border-radius: 50%;',
          '  box-shadow: inset 0 -2px 0 var(--galeo-color-accent);',
          '  --galeo-status-bar-height: 24px;',
          '  width: 32px;',
          '}',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('reports px text sizes, spacing, corners and colour literals', () => {
    expect(
      found(
        [
          '.a {',
          '  font-size: 14px;',
          '  font: 600 16px var(--galeo-font-ui);',
          '  padding: 5px var(--galeo-space-md);',
          '  margin: 0 -4px;',
          '  gap: 12px;',
          '  border-radius: 4px;',
          '  border-top-left-radius: 2px;',
          '  background: #ffffff;',
          '  box-shadow: 0 2px 8px rgb(0 0 0 / 20%);',
          '  color: color-mix(in srgb, red 10%, blue);',
          '}',
        ].join('\n'),
      ),
    ).toEqual([
      '2 a px text size',
      '3 a px text size',
      '4 a px spacing of 2 px or more',
      '5 a px spacing of 2 px or more',
      '6 a px spacing of 2 px or more',
      '7 a px corner',
      '8 a px corner',
      '9 a colour literal',
      '10 a colour literal',
      '11 a colour literal',
    ]);
  });

  it('lets a line keep a literal when it says why', () => {
    expect(found('.a {\n  padding-left: 78px; /* literal: clears the macOS window buttons */\n  background: #fff; /* literal: white in both themes */\n}')).toEqual([]);
  });
});
