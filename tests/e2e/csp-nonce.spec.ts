import { test, expect, type APIResponse } from '@playwright/test';

/**
 * Per-request CSP nonce (ADR-0019), checked against the real Worker under
 * wrangler dev (the `worker` project): `run_worker_first` routes HTML through
 * src/worker.ts, which appends a fresh `'nonce-…'` to `script-src` of every
 * HTML response — static pages and on-demand routes alike — while the
 * build-time hashes stay and assets keep their static headers untouched.
 *
 * The other half of the contract, Cloudflare stamping that nonce on the
 * bot-detection script it injects at the edge, cannot be exercised locally;
 * the post-deploy smoke covers it (tests/e2e/production.spec.ts).
 */

const NONCE = /'nonce-([A-Za-z0-9+/]{22}==)'/;

/** Asserts the strict-policy-plus-nonce shape and returns the nonce value. */
const nonceOf = (res: APIResponse): string => {
  const csp = res.headers()['content-security-policy'] ?? '';
  expect(csp, 'a CSP header is present').not.toBe('');
  expect(csp).not.toMatch(/unsafe-/);
  expect((csp.match(/nonce-/g) ?? []).length, 'exactly one nonce source').toBe(1);
  const scriptSrc = csp.match(/(?:^|;\s*)script-src ([^;]*)/)?.[1] ?? '';
  expect(scriptSrc, 'build-time hashes are still pinned').toMatch(/'sha256-/);
  const nonce = scriptSrc.match(NONCE)?.[1];
  expect(nonce, 'the nonce sits in script-src').toBeTruthy();
  return nonce!;
};

test('static HTML leaves the Worker with a fresh nonce beside its hashes', async ({ request }) => {
  const first = await request.get('/');
  const second = await request.get('/');
  for (const res of [first, second]) {
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/html');
  }
  expect(nonceOf(first), 'each response is minted its own nonce').not.toBe(nonceOf(second));
});

test('a nested static route carries the nonce with its own family policy', async ({ request }) => {
  const res = await request.get('/work');
  expect(res.status()).toBe(200);
  nonceOf(res);
});

test('the on-demand grievance page carries the nonce with its runtime hashes', async ({
  request,
}) => {
  const res = await request.get('/policies/grievances');
  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toBe('no-store');
  nonceOf(res);
});

test('the on-demand search page carries the nonce and stays out of the index', async ({
  request,
}) => {
  const res = await request.get('/search?q=data');
  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toBe('no-store');
  nonceOf(res);
  expect(await res.text()).toContain('<meta name="robots" content="noindex, follow">');
});

test('assets keep their static headers: no CSP, no nonce', async ({ request }) => {
  const res = await request.get('/robots.txt');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/plain');
  expect(res.headers()['content-security-policy']).toBeUndefined();
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
});

test('the canonical host carries no X-Robots-Tag from the Worker', async ({ request }) => {
  // src/worker.ts noindexes *.workers.dev preview hosts only (ADR-0013).
  // wrangler dev presents every request as the route host (quarry.team), so
  // this project sees the canonical branch; src/worker.test.ts drives the
  // preview branch through the entry directly.
  for (const path of ['/', '/policies/grievances']) {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()['x-robots-tag'], path).toBeUndefined();
  }
});

test('what the asset layer decides passes through: legacy 301s and the trailing-slash 307', async ({
  request,
}) => {
  // The wrapper offers GET/HEAD to the assets binding with redirect: 'manual'
  // before the adapter sees them, so _redirects and html_handling answers are
  // not followed into a 200 at their target.
  const legacy = await request.get('/privacy', { maxRedirects: 0 });
  expect(legacy.status()).toBe(301);
  expect(new URL(legacy.headers().location!, 'http://localhost').pathname).toBe(
    '/policies/privacy',
  );
  const slash = await request.get('/work/', { maxRedirects: 0 });
  expect(slash.status()).toBe(307);
  expect(new URL(slash.headers().location!, 'http://localhost').pathname).toBe('/work');
});
