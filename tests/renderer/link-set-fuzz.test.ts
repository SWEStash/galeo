import { describe, expect, it } from 'vitest';
import { createRenderer } from '../../src/renderer/worker/pipeline/render';
import { extractReferences } from '../../src/shared/markdown/references';

/** A small seeded generator, so a failure names a reproducible document. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

const TARGETS = [
  'a.md', 'dir/b.md', '../up.md', '#section', 'c.md#part', 'https://x.example/p?q=1', 'http://y.example',
  'mailto:me@example.org', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', '//evil.example/x', 'file:///etc/passwd',
  'vbscript:x', 'data:text/html,x', 'with%20space.md', 'galeo://file/abc', 'irc://chat.example',
  '%5C%5Cevil.example%5Cshare%5Cx.png', '%2F%2Fevil.example/a.md', '/%2Fevil.example/b.md',
];

const PIECES: ((target: string, n: number) => string)[] = [
  (t) => `[inline](${t})`,
  (t) => `[inline](<${t}>)`,
  (t, n) => `[ref][r${n}]\n\n[r${n}]: ${t}`,
  (t) => `<${t}>`,
  (t) => `<a href="${t}">raw</a>`,
  (t) => `<a href='${t}' title="x">raw</a>`,
  (t) => `![image](${t})`,
  (t) => `<img src="${t}" alt="">`,
  (t) => `\`[code](${t})\``,
  (t) => '```\n[fenced](' + t + ')\n```',
  (t) => `**[bold](${t})**`,
  (t) => `| h |\n| - |\n| [cell](${t}) |`,
  (t, n) => `note[^f${n}]\n\n[^f${n}]: [in footnote](${t})`,
  (t) => `<!-- [comment](${t}) -->`,
  (t) => `$x$ [after math](${t}) $$y$$`,
  (t) => `[nested [brackets]](${t})`,
  (t) => `<details><summary>s</summary><a href="${t}">in details</a></details>`,
  (t) => `&#91;not a link&#93;(${t})`,
];

// MDX has no autolinks, HTML comments or unclosed tags; it adds components, expressions and ESM.
const MDX_PIECES: ((target: string, n: number) => string)[] = [
  (t) => `[inline](${t})`,
  (t, n) => `[ref][r${n}]\n\n[r${n}]: ${t}`,
  (t) => `<a href="${t}">raw</a>`,
  (t) => `<img src="${t}" alt="" />`,
  (t) => `![image](${t})`,
  (t) => `<Card href="${t}" src="${t}">card [inner](${t})</Card>`,
  (t) => `<a href={"${t}"}>expression href</a>`,
  (t) => `{"[expression](${t})"}`,
  (t, n) => `import x${n} from '${t}'`,
  (t) => '```\n[fenced](' + t + ')\n```',
  (t) => `| h |\n| - |\n| [cell](${t}) |`,
  (t, n) => `note[^f${n}]\n\n[^f${n}]: [in footnote](${t})`,
  (t) => `<details><summary>s</summary><a href="${t}">in details</a></details>`,
];

function document(seed: number, pieces = PIECES): string {
  const next = random(seed);
  const pick = <T,>(items: T[]) => items[Math.floor(next() * items.length)]!;
  return Array.from({ length: 1 + Math.floor(next() * 8) }, (_, n) => pick(pieces)(pick(TARGETS), n)).join('\n\n');
}

describe("the renderer's references match main's", () => {
  const renderer = createRenderer({ cacheEntries: 0 });

  it('on 300 generated documents mixing every link form', async () => {
    for (let seed = 1; seed <= 300; seed++) {
      const text = document(seed);
      const { links, images } = await renderer.markdown(text);
      expect({ seed, links, images }).toEqual({ seed, ...extractReferences(text) });
    }
  }, 60_000);

  it('on 300 generated MDX documents, parsed as MDX on both sides', async () => {
    for (let seed = 1; seed <= 300; seed++) {
      const text = document(seed, MDX_PIECES);
      const { links, images } = await renderer.markdown(text, { format: 'mdx' });
      expect({ seed, links, images }).toEqual({ seed, ...extractReferences(text, 'mdx') });
    }
  }, 60_000);
});
