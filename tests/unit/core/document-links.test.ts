import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DocumentLinks } from '../../../src/core/documents/links';
import { TabRegistry } from '../../../src/core/tabs/registry';
import { ExternalOpenLimiter } from '../../../src/core/links/limiter';
import { extractReferences, type References } from '../../../src/shared/markdown/references';
import { ImageGrants, IMAGE_MAX_BYTES } from '../../../src/core/documents/images';
import { FakeClock, FakeFileSystem, FakeOsShell, FakeTaskRunner } from '../../helpers/fakes';

const DOC = [
  '[next](next.md) [section](next.md#scope) [top](#intro)',
  '[site](https://example.org/a) [mail](mailto:me@example.org) [bad](javascript:alert(1))',
  '<a href="//evil.example/x">far</a> [s1](https://a.example) [s2](https://b.example) [s3](https://c.example) [s4](https://d.example)',
].join('\n\n');

function setup(options: { burst?: boolean; references?: (text: string) => References } = {}) {
  const clock = new FakeClock(1_000_000);
  let n = 0;
  const records = new TabRegistry(() => `id-${++n}`);
  const tasks = new FakeTaskRunner({ references: (text) => (options.references ?? extractReferences)(text as string) });
  const shell = new FakeOsShell();
  const fs = new FakeFileSystem({
    '/d/pics/dot.png': new Uint8Array(8),
    '/d/pics/big.png': new Uint8Array(IMAGE_MAX_BYTES + 1),
    '/d/notes.txt': 'not an image',
    '/d/folder.png/inner.txt': 'x',
  });
  const asked: number[] = [];
  const links = new DocumentLinks({
    records,
    fs,
    images: new ImageGrants(() => `img-${++n}`),
    tasks,
    shell,
    limiter: new ExternalOpenLimiter(clock),
    confirmBurst: async (window) => (asked.push(window), options.burst ?? true),
    dirname: path.posix.dirname,
    resolve: path.posix.resolve,
    parseUrl: (href) => {
      try {
        const url = new URL(href);
        return { protocol: url.protocol, href: url.href };
      } catch {
        return null;
      }
    },
  });
  const { id } = records.open('/d/plan.md', 1);
  links.remember(id, 1, '/d/plan.md', DOC);
  return { clock, records, tasks, shell, links, id, asked, fs };
}

describe('DocumentLinks.follow', () => {
  it('navigates the tab to a linked local file, anchor included', async () => {
    const { links, records, id } = setup();
    expect(await links.follow(id, 1, 'next.md#scope')).toEqual({ kind: 'navigated', anchor: 'scope' });
    expect(records.get(id, 1)?.path).toBe('/d/next.md');
  });

  it('moves within the document for an anchor, as a history entry', async () => {
    const { links, records, id } = setup();
    expect(await links.follow(id, 1, '#intro')).toEqual({ kind: 'anchor', anchor: 'intro' });
    expect(records.get(id, 1)?.path).toBe('/d/plan.md');
    expect(await links.back(id, 1)).toEqual({ kind: 'anchor', anchor: '' });
  });

  it('opens http, https and mailto links in the browser, normalized', async () => {
    const { links, shell, clock, id } = setup();
    expect(await links.follow(id, 1, 'https://example.org/a')).toEqual({ kind: 'external' });
    clock.advance(1000);
    expect(await links.follow(id, 1, 'mailto:me@example.org')).toEqual({ kind: 'external' });
    expect(shell.calls).toEqual([
      { method: 'openExternal', target: 'https://example.org/a' },
      { method: 'openExternal', target: 'mailto:me@example.org' },
    ]);
  });

  it('refuses anything that is not literally in the document it read (SR-04)', async () => {
    const { links, shell, records, id } = setup();
    for (const href of ['https://exfil.example/?data=secret', 'https://example.org/a?x', 'HTTPS://example.org/a', '/etc/passwd', 'secret.md']) {
      expect(await links.follow(id, 1, href)).toEqual({ kind: 'refused', reason: 'not-in-document' });
    }
    expect(shell.calls).toEqual([]);
    expect(records.get(id, 1)?.path).toBe('/d/plan.md');
  });

  it('refuses a disallowed scheme or host even if the link set somehow holds it', async () => {
    // The sanitizer keeps these out of the link set; main refuses them regardless.
    const { links, shell, id } = setup({
      references: () => ({ links: ['ftp://files.example/x', '//evil.example/x', 'JAVASCRIPT:alert(1)'], images: [] }),
    });
    expect(await links.follow(id, 1, 'ftp://files.example/x')).toEqual({ kind: 'refused', reason: 'scheme' });
    expect(await links.follow(id, 1, '//evil.example/x')).toEqual({ kind: 'refused', reason: 'host' });
    expect(await links.follow(id, 1, 'JAVASCRIPT:alert(1)')).toEqual({ kind: 'refused', reason: 'scheme' });
    expect(shell.calls).toEqual([]);
  });

  it('reports a browser that could not be started, instead of failing the request', async () => {
    const { links, shell, id } = setup();
    shell.openExternal = async () => Promise.reject(new Error('no handler'));
    expect(await links.follow(id, 1, 'https://example.org/a')).toEqual({ kind: 'refused', reason: 'open-failed' });
  });

  it('refuses links for a document main has not read, or of another window', async () => {
    const { links, records, id } = setup();
    const unread = records.open('/d/other.md', 1).id;
    expect(await links.follow(unread, 1, 'next.md')).toEqual({ kind: 'refused', reason: 'not-in-document' });
    expect(await links.follow(id, 2, 'next.md')).toEqual({ kind: 'refused', reason: 'not-in-document' });
  });

  it('refuses when link extraction overruns its time budget', async () => {
    const { links, tasks, id } = setup();
    tasks.hang('references');
    expect(await links.follow(id, 1, 'next.md')).toEqual({ kind: 'refused', reason: 'unavailable' });
  });

  it('rate-limits external opens and asks before a burst, remembering the answer', async () => {
    const { links, shell, clock, id, asked } = setup({ burst: true });
    expect(await links.follow(id, 1, 'https://a.example')).toEqual({ kind: 'external' });
    expect(await links.follow(id, 1, 'https://b.example')).toEqual({ kind: 'refused', reason: 'rate-limited' });
    for (const href of ['https://b.example', 'https://c.example']) {
      clock.advance(1000);
      await links.follow(id, 1, href);
    }
    clock.advance(1000);
    expect(await links.follow(id, 1, 'https://d.example')).toEqual({ kind: 'external' });
    expect(asked).toEqual([1]);
    expect(shell.calls).toHaveLength(4);
  });

  it('asks only once while a burst confirmation is open', async () => {
    const { links, shell, clock, id, asked } = setup({ burst: true });
    for (const href of ['https://a.example', 'https://b.example', 'https://c.example']) {
      await links.follow(id, 1, href);
      clock.advance(1000);
    }
    const [first, second] = await Promise.all([
      links.follow(id, 1, 'https://d.example'),
      links.follow(id, 1, 'https://a.example'),
    ]);
    expect(asked).toEqual([1]);
    expect(first).toEqual({ kind: 'external' });
    expect(second).toEqual({ kind: 'refused', reason: 'rate-limited' });
    expect(shell.calls).toHaveLength(4);
  });

  it('blocks the document when the user refuses a burst', async () => {
    const { links, shell, clock, id } = setup({ burst: false });
    for (const href of ['https://a.example', 'https://b.example', 'https://c.example']) {
      await links.follow(id, 1, href);
      clock.advance(1000);
    }
    expect(await links.follow(id, 1, 'https://d.example')).toEqual({ kind: 'refused', reason: 'blocked' });
    clock.advance(1000);
    expect(await links.follow(id, 1, 'https://a.example')).toEqual({ kind: 'refused', reason: 'blocked' });
    expect(shell.calls).toHaveLength(3);
  });

  it('checks the next document against its own links once navigated', async () => {
    const { links, id } = setup();
    await links.follow(id, 1, 'next.md');
    expect(await links.follow(id, 1, '#intro')).toEqual({ kind: 'refused', reason: 'not-in-document' });
    links.remember(id, 1, '/d/next.md', '[back](plan.md)');
    expect(await links.follow(id, 1, 'plan.md')).toEqual({ kind: 'navigated', anchor: null });
  });
});

describe('DocumentLinks history', () => {
  it('goes back to the previous file and forward again', async () => {
    const { links, records, id } = setup();
    await links.follow(id, 1, 'next.md#scope');
    expect(await links.back(id, 1)).toEqual({ kind: 'navigated', anchor: null });
    expect(records.get(id, 1)?.path).toBe('/d/plan.md');
    expect(await links.forward(id, 1)).toEqual({ kind: 'navigated', anchor: 'scope' });
    expect(await links.forward(id, 1)).toEqual({ kind: 'none' });
  });

  it('has nothing to go back to at the start', async () => {
    const { links, id } = setup();
    expect(await links.back(id, 1)).toEqual({ kind: 'none' });
  });
});

describe('DocumentLinks.resolveImage', () => {
  const IMAGES = '![dot](pics/dot.png) ![big](pics/big.png) ![text](notes.txt) ![gone](pics/gone.png) ![dir](folder.png)';

  it('grants an opaque galeo://file URL for an image the document shows', async () => {
    const { links, id } = setup();
    links.remember(id, 1, '/d/plan.md', IMAGES);
    const result = await links.resolveImage(id, 1, 'pics/dot.png');
    expect(result).toMatchObject({ kind: 'image' });
    expect((result as { url: string }).url).toMatch(/^galeo:\/\/file\/img-\d+$/);
    expect((result as { url: string }).url).not.toContain('dot');
  });

  it('refuses an image the document does not show, even if it exists (SR-12)', async () => {
    const { links, id } = setup();
    links.remember(id, 1, '/d/plan.md', IMAGES);
    expect(await links.resolveImage(id, 1, '../d/pics/dot.png')).toEqual({ kind: 'refused', reason: 'not-in-document' });
    expect(await links.resolveImage(id, 1, '/d/pics/dot.png')).toEqual({ kind: 'refused', reason: 'not-in-document' });
  });

  it.each([
    ['notes.txt', 'not-an-image'],
    ['pics/big.png', 'too-large'],
    ['pics/gone.png', 'missing'],
    ['folder.png', 'not-an-image'],
  ] as const)('refuses %s: %s', async (src, reason) => {
    const { links, id } = setup();
    links.remember(id, 1, '/d/plan.md', IMAGES);
    expect(await links.resolveImage(id, 1, src)).toEqual({ kind: 'refused', reason });
  });

  it("refuses images of another window's document", async () => {
    const { links, id } = setup();
    links.remember(id, 1, '/d/plan.md', IMAGES);
    expect(await links.resolveImage(id, 2, 'pics/dot.png')).toEqual({ kind: 'refused', reason: 'not-in-document' });
  });
});
