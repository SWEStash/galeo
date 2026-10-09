import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import electronBinary from 'electron';
import { appDirs, launchApp, removeTempHome, tempHome } from '../../helpers/launch';
import { networkConnects } from './strace';

// Playwright injects this loader itself only when it starts Electron directly.
const playwrightLoader = path.join(
  path.dirname(createRequire(import.meta.url).resolve('playwright-core/package.json')),
  'lib/server/electron/loader.js',
);

const hasStrace = spawnSync('strace', ['-V']).status === 0;
test.skip(process.platform !== 'linux' || !hasStrace, 'the socket-level proof runs on Linux with strace');

/**
 * A hostname and an IP literal: host resolution is disabled in the app, so only an IP literal
 * shows whether the guard itself stops a connection.
 */
const REMOTES = ['https://example.com', 'https://1.1.1.1'];

/** Every channel SR-07 names, tried from the app page (the CSP applies) and from main's session. */
async function tryRemoteResources(app: Awaited<ReturnType<typeof launchApp>>['app'], page: Awaited<ReturnType<typeof launchApp>>['window']) {
  for (const remote of REMOTES) await page.evaluate(async (remote) => {
    const settle = (element: HTMLElement) =>
      new Promise<void>((resolve) => {
        element.addEventListener('load', () => resolve(), { once: true });
        element.addEventListener('error', () => resolve(), { once: true });
        setTimeout(resolve, 2_000);
      });
    const add = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]>) => {
      const element = Object.assign(document.createElement(tag), props);
      document.head.append(element);
      return element;
    };

    const style = add('style', {
      textContent: `@import url("${remote}/import.css");
        @font-face { font-family: remote; src: url("${remote}/font.woff2"); }
        body { background: url("${remote}/bg.png"); font-family: remote; }`,
    });
    const img = new Image();
    img.src = `${remote}/pixel.png`;
    const iframe = document.createElement('iframe');
    iframe.src = `${remote}/frame.html`;
    document.body.append(iframe);
    for (const rel of ['dns-prefetch', 'preconnect', 'prefetch', 'preload']) {
      add('link', { rel, href: `${remote}/${rel}`, as: 'image' });
    }
    const socket = new WebSocket(`${remote.replace('https:', 'wss:')}/socket`);

    // The app removes WebRTC; if it ever comes back, gathering ICE candidates must not connect.
    const Peer = (globalThis as { RTCPeerConnection?: typeof RTCPeerConnection }).RTCPeerConnection;
    const peer = Peer && new Peer({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    const iceDone = new Promise<void>((resolve) => {
      if (!peer) return resolve();
      peer.addEventListener('icegatheringstatechange', () => {
        if (peer.iceGatheringState === 'complete') resolve();
      });
      setTimeout(resolve, 5_000);
    });
    if (peer) {
      peer.createDataChannel('probe');
      await peer.setLocalDescription(await peer.createOffer());
    }

    await Promise.all([
      fetch(`${remote}/data.json`).catch(() => undefined),
      settle(img),
      settle(iframe),
      settle(style),
      new Promise<void>((resolve) => {
        socket.onerror = socket.onclose = () => resolve();
        setTimeout(resolve, 2_000);
      }),
      iceDone,
    ]);
    peer?.close();
    document.fonts.check('12px remote');
    // DNS prefetch and preconnect give no completion event; leave them a moment to fire.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }, remote);
  await app.evaluate(async ({ net }, remotes) => {
    for (const remote of remotes) {
      for (const url of [`${remote}/`, `${remote.replace('https:', 'http:')}/`]) await net.fetch(url).catch(() => undefined);
    }
  }, REMOTES);
}

/**
 * `--seccomp-bpf` makes strace stop only on connect(): plain `strace -f` stops on every syscall,
 * and Chromium's zygote children then die with SIGTRAP.
 */
async function connectsWhileTrying(env: Record<string, string> = {}): Promise<string[]> {
  return connectsWhile([], env, async (app, page) => {
    await expect(page.getByTestId('app-root')).toHaveAttribute('data-worker', 'ready');
    await tryRemoteResources(app, page);
  });
}

/** Runs `action` against the app started with `args` under strace; returns its network connects. */
async function connectsWhile(
  args: string[] | ((dir: string) => string[]),
  env: Record<string, string>,
  action: (app: Awaited<ReturnType<typeof launchApp>>['app'], page: Awaited<ReturnType<typeof launchApp>>['window']) => Promise<void>,
  home?: string,
): Promise<string[]> {
  const dir = mkdtempSync(path.join(tmpdir(), 'galeo-no-network-'));
  try {
    const log = path.join(dir, 'connect.log');
    const traced = path.join(dir, 'electron-traced');
    writeFileSync(
      traced,
      `#!/bin/sh\nexec strace -f --seccomp-bpf -qq -e trace=connect -o '${log}' '${electronBinary as unknown as string}' -r '${playwrightLoader}' "$@"\n`,
    );
    chmodSync(traced, 0o755);
    const { app, window: page, close } = await launchApp(typeof args === 'function' ? args(dir) : args, {
      executablePath: traced,
      env,
      ...(home ? { home } : {}),
    });
    try {
      await action(app, page);
    } finally {
      await close();
    }
    return networkConnects(readFileSync(log, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('no remote resource makes the app connect to the network (SR-07)', async () => {
  expect(await connectsWhileTrying()).toEqual([]);
});

test('rendering the whole payload corpus opens no connection (SR-07)', async () => {
  const payloads = path.resolve(import.meta.dirname, '../../fixtures/payloads');
  const corpus = readdirSync(payloads)
    .filter((file) => file.endsWith('.payloads.md'))
    .map((file) => readFileSync(path.join(payloads, file), 'utf8').replaceAll(/^%%%$/gm, ''))
    .join('\n\n');
  const connects = await connectsWhile(
    (dir) => {
      writeFileSync(path.join(dir, 'corpus.md'), corpus);
      return ['--', path.join(dir, 'corpus.md')];
    },
    {},
    async (_app, page) => {
      await expect(page.getByTestId('document').locator('article')).not.toBeEmpty();
      // Give loads, prefetch hints and error handlers time to fire before the trace ends.
      await page.waitForTimeout(2_000);
    },
  );
  expect(connects).toEqual([]);
});

test('rendering the hostile MDX payloads as an .mdx file opens no connection (SR-07)', async () => {
  const corpus = readFileSync(path.resolve(import.meta.dirname, '../../fixtures/payloads/mdx.payloads.mdx'), 'utf8').replaceAll(/^%%%$/gm, '');
  const connects = await connectsWhile(
    (dir) => {
      writeFileSync(path.join(dir, 'corpus.mdx'), corpus);
      return ['--', path.join(dir, 'corpus.mdx')];
    },
    {},
    async (_app, page) => {
      // Rendered as MDX: its components are boxes, not dropped tags.
      await expect(page.getByTestId('document').locator('[data-galeo-mdx="Callout"]')).toBeVisible();
      await page.waitForTimeout(2_000);
    },
  );
  expect(connects).toEqual([]);
});

test('drawing every diagram, hostile ones included, opens no connection (SR-07)', async () => {
  const fixtures = path.resolve(import.meta.dirname, '../../fixtures');
  const corpus = [path.join(fixtures, 'docs', 'mermaid.md'), path.join(fixtures, 'payloads', 'mermaid.payloads.md')]
    .map((file) => readFileSync(file, 'utf8').replaceAll(/^%%%$/gm, ''))
    .join('\n\n');
  const connects = await connectsWhile(
    (dir) => {
      writeFileSync(path.join(dir, 'diagrams.md'), corpus);
      return ['--', path.join(dir, 'diagrams.md')];
    },
    {},
    async (_app, page) => {
      // Diagrams are drawn as they come into view: show each one.
      const diagrams = page.getByTestId('document').locator('.galeo-diagram');
      await expect(diagrams.first()).toBeAttached();
      for (const diagram of await diagrams.all()) {
        await diagram.scrollIntoViewIfNeeded();
        await expect(diagram).not.toHaveAttribute('data-state', 'pending');
      }
      await page.waitForTimeout(2_000);
    },
  );
  expect(connects).toEqual([]);
});

test('a custom.css that loads remote files opens no connection (SR-06, SR-07)', async () => {
  const home = tempHome();
  try {
    mkdirSync(appDirs(home).config, { recursive: true });
    writeFileSync(
      path.join(appDirs(home).config, 'custom.css'),
      [
        '@import url("https://example.com/import.css");',
        'article { background-image: url("https://example.com/background.png"); }',
        '@font-face { font-family: Remote; src: url("https://example.com/font.woff2"); }',
        'article p { font-family: Remote; }',
      ].join('\n'),
    );
    const doc = path.resolve(import.meta.dirname, '../../fixtures/docs/basic.md');
    const connects = await connectsWhile(
      ['--', doc],
      {},
      async (_app, page) => {
        const article = page.getByTestId('document').locator('article');
        await expect(article.locator('p').first()).toBeVisible();
        // The CSS is applied: its remote background is what the document asks for (and the page's CSP refuses).
        await expect.poll(() => article.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain('https://example.com/background.png');
        await page.waitForTimeout(2_000);
      },
      home,
    );
    expect(connects).toEqual([]);
  } finally {
    removeTempHome(home);
  }
});

test('the resolver lockdown alone keeps the app off the network', async () => {
  // Without the guard, a hostname request reaches Chromium's resolver, which first probes IPv6
  // reachability: a UDP connect() to this fixed address that sends no packet. Nothing else may
  // connect. The shipped configuration (both layers on) must not even do that (test above).
  const IPV6_PROBE = 'inet_pton(AF_INET6, "2001:4860:4860::8888"';
  const connects = await connectsWhileTrying({ GALEO_TEST_DISABLE_NETWORK_GUARD: '1' });
  expect(connects.filter((line) => !line.includes(IPV6_PROBE))).toEqual([]);
});

test('the harness sees the traffic when both layers are off', async () => {
  const connects = await connectsWhileTrying({
    GALEO_TEST_DISABLE_NETWORK_GUARD: '1',
    GALEO_TEST_DISABLE_RESOLVER_LOCKDOWN: '1',
  });
  expect(connects.some((line) => line.includes('inet_addr("1.1.1.1")'))).toBe(true);
});
