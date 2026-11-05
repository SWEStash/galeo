// Style literal check for the app's stylesheet (ADR-032): text sizes, spacing, corners and colours come
// from the tokens in tokens.css, so a change of look is a change of token values. A line that needs a
// literal says why with a `/* literal: … */` comment on that line.
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** The stylesheets checked (tokens.css defines the values and is not). */
export const STYLESHEETS = ['src/renderer/styles/app.css'];

const RULES = [
  { what: 'a px text size', property: /^(font|font-size)$/, value: /(?<![\w.-])\d+(\.\d+)?px/ },
  { what: 'a px spacing of 2 px or more', property: /^(padding|margin|gap|row-gap|column-gap|inset)(-[a-z]+)?$/, value: /(?<![\w.])-?([2-9]|\d{2,})(\.\d+)?px/ },
  { what: 'a px corner', property: /^border(-[a-z]+)*-radius$/, value: /(?<![\w.-])\d+(\.\d+)?px/ },
  { what: 'a colour literal', property: /./, value: /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|color-mix)\(/i },
];

/** Each declaration that breaks a rule: `{ line, what, text }`. */
export function checkStylesheet(css) {
  const found = [];
  css.split('\n').forEach((text, index) => {
    if (/\/\*\s*literal:/.test(text)) return;
    const declaration = text.replace(/\/\*.*?\*\//g, '').match(/^\s*(-?-?[a-z-]+)\s*:\s*(.+?);?\s*$/i);
    if (!declaration || declaration[1].startsWith('--')) return;
    const [, property, value] = declaration;
    for (const rule of RULES) {
      if (rule.property.test(property) && rule.value.test(value)) found.push({ line: index + 1, what: rule.what, text: text.trim() });
    }
  });
  return found;
}

if (import.meta.main) {
  const root = path.resolve(process.argv[2] ?? '.');
  let count = 0;
  for (const file of STYLESHEETS) {
    for (const { line, what, text } of checkStylesheet(readFileSync(path.join(root, file), 'utf8'))) {
      console.error(`${file}:${line}: ${what} (use a token, or mark it /* literal: why */): ${text}`);
      count++;
    }
  }
  if (count > 0) {
    console.error(`\n${count} style literal(s)`);
    process.exit(1);
  }
  console.log('Styles OK');
}
