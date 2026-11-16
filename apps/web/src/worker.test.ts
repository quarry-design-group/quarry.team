import { describe, expect, it, vi } from 'vitest';

/**
 * The Worker entry's host handling (ADR-0013): PR previews are Worker versions
 * served on `*.workers.dev`, outside the zone's staging noindex rule, so the
 * entry marks every response there `X-Robots-Tag: noindex, nofollow` itself.
 * `wrangler dev` rewrites every request to the route host, so the Worker e2e
 * project reaches the entry only as the canonical host (and asserts no header
 * there); this suite drives both hosts through the entry directly.
 */

vi.mock('@astrojs/cloudflare/handler', () => ({
  handle: vi.fn(
    async () =>
      new Response('{"ok":false}', {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
  ),
}));

const { default: worker } = await import('./worker');

const PREVIEW = 'https://abc12345-quarry-web-staging.quarry.workers.dev';
const CANONICAL = 'https://quarry.team';

/** An assets binding that serves `/` as a policy-carrying page, `/privacy` as
 *  a `_redirects` 301, and 404s everything else (the on-demand routes). */
const env = {
  ASSETS: {
    async fetch(request: Request) {
      const { pathname } = new URL(request.url);
      if (pathname === '/')
        return new Response('<!doctype html>', {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'content-security-policy': "default-src 'self'; script-src 'self'",
          },
        });
      if (pathname === '/privacy')
        return new Response(null, { status: 301, headers: { location: '/policies/privacy' } });
      return new Response('not found', { status: 404 });
    },
  },
};

const serve = (url: string, init?: RequestInit) =>
  (worker.fetch as (...args: unknown[]) => Promise<Response>)(new Request(url, init), env, {});

describe('the Worker entry on a preview host (*.workers.dev)', () => {
  it('noindexes a static page and keeps its nonce', async () => {
    const res = await serve(`${PREVIEW}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(res.headers.get('content-security-policy')).toMatch(/script-src 'nonce-/);
    expect(await res.text()).toBe('<!doctype html>');
  });

  it('noindexes an asset-layer redirect without following it', async () => {
    const res = await serve(`${PREVIEW}/privacy`);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/policies/privacy');
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('noindexes an on-demand response from the adapter', async () => {
    const res = await serve(`${PREVIEW}/api/contact`, { method: 'POST' });
    expect(res.status).toBe(400);
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });
});

describe('the Worker entry on the canonical host', () => {
  it('adds no X-Robots-Tag', async () => {
    for (const res of [
      await serve(`${CANONICAL}/`),
      await serve(`${CANONICAL}/privacy`),
      await serve(`${CANONICAL}/api/contact`, { method: 'POST' }),
    ]) {
      expect(res.headers.get('x-robots-tag')).toBeNull();
    }
  });
});
