import { expect, test } from '@playwright/test';
import { launchApp } from '../../helpers/launch';

test.describe('zero network (SR-02, SR-06)', () => {
  test('the guard cancels remote requests that reach the session', async () => {
    const { app, close } = await launchApp();
    try {
      const results = await app.evaluate(async ({ net }) => {
        const attempt = (url: string) =>
          net.fetch(url).then(
            () => 'loaded',
            (error: unknown) => String(error),
          );
        return {
          https: await attempt('https://example.com/'),
          http: await attempt('http://example.com/'),
          blocked: (globalThis as { __galeoBlockedRequests?: string[] }).__galeoBlockedRequests ?? [],
        };
      });
      expect(results.https).toContain('ERR_BLOCKED_BY_CLIENT');
      expect(results.http).toContain('ERR_BLOCKED_BY_CLIENT');
      expect(results.blocked).toEqual(expect.arrayContaining(['https://example.com/', 'http://example.com/']));
    } finally {
      await close();
    }
  });

  test('the page cannot load remote resources', async () => {
    const { window: page, close } = await launchApp();
    try {
      const outcomes = await page.evaluate(async () => {
        const fetchResult = await fetch('https://example.com/').then(
          () => 'loaded',
          () => 'failed',
        );
        const imageResult = await new Promise<string>((resolve) => {
          const img = new Image();
          img.onload = () => resolve('loaded');
          img.onerror = () => resolve('failed');
          img.src = 'https://example.com/pixel.png';
        });
        const socketResult = await new Promise<string>((resolve) => {
          try {
            const socket = new WebSocket('wss://example.com/socket');
            socket.onopen = () => resolve('loaded');
            socket.onerror = () => resolve('failed');
          } catch {
            resolve('failed');
          }
        });
        return [fetchResult, imageResult, socketResult];
      });
      expect(outcomes).toEqual(['failed', 'failed', 'failed']);
    } finally {
      await close();
    }
  });

  test('app pages carry the strict CSP', async () => {
    const { window: page, close } = await launchApp();
    try {
      const csp = await page.evaluate(() =>
        fetch('galeo://app/index.html').then((response) => response.headers.get('content-security-policy')),
      );
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("script-src 'self'");
    } finally {
      await close();
    }
  });
});
