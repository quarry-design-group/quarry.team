import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { backboneRoutes } from './routes';

/**
 * Strict-CSP contract (ADR-0015): the shipped Content-Security-Policy carries
 * no 'unsafe-*' source expression anywhere — script-src and style-src are
 * hash-pinned at build (scripts/inject-csp-hashes.mjs), emitted as overlap-
 * free per-route-family rules (Cloudflare caps _headers lines at 2000 chars;
 * /* carries no CSP because the production pipeline does not reliably honor
 * `!` detach) with a <meta> CSP inside 404.html covering unmatched paths.
 * sirv doesn't apply `_headers`, so these tests
 * enforce the built policy themselves via response interception, resolving
 * each route to its matching rule the way the edge would. This is the gate
 * that catches a new inline script/style landing without its hash, a style=""
 * attribute sneaking back in (those need CSP's 'unsafe-hashes'), a dependency
 * (e.g. cobe's runtime stylesheet) changing what it injects, or a family's
 * rule going missing.
 */
const HEADERS_FILE = fileURLToPath(new URL('../../apps/web/dist/client/_headers', import.meta.url));

type CspRules = { families: Map<string, string> };

/** Parse every CSP line out of the built _headers, keyed by its rule path. */
const parseCsp = (): CspRules => {
  const lines = readFileSync(HEADERS_FILE, 'utf8').split('\n');
  const families = new Map<string, string>();
  let path = '';
  for (const line of lines) {
    if (/^\S/.test(line)) path = line.trim();
    const m = line.match(/^ {2}Content-Security-Policy: (.*)$/);
    if (!m) continue;
    if (path === '/*') throw new Error('/* must not carry a CSP (overlap-free contract)');
    families.set(path, m[1]!);
  }
  if (families.size === 0 || !families.has('/404')) {
    throw new Error('built _headers is missing the per-family CSP rules (incl. /404)');
  }
  return { families };
};

/** Resolve a route to its CSP the way the edge matches rules (exact, then glob). */
const cspFor = (rules: CspRules, route: string): string => {
  if (rules.families.has(route)) return rules.families.get(route)!;
  const seg = `/${route.split('/')[1]}/*`;
  const hit = rules.families.get(seg);
  if (!hit) throw new Error(`no CSP rule covers ${route}`);
  return hit;
};

test('every built policy is strict: hash-pinned, no unsafe-*, no leftover tokens', () => {
  const rules = parseCsp();
  for (const [path, policy] of rules.families) {
    expect(policy, `${path} policy must carry no unsafe-*`).not.toMatch(/unsafe-/);
    expect(policy, `${path} policy must have replaced tokens`).not.toContain('__CSP_');
    expect(policy, `${path} script-src must be hash-pinned`).toMatch(/script-src [^;]*'sha256-/);
    expect(policy, `${path} style-src must be hash-pinned`).toMatch(/style-src [^;]*'sha256-/);
  }
});

test('every backbone route renders violation-free under its enforced CSP', async ({ page }) => {
  const rules = parseCsp();
  let policy = '';
  await page.route('**/*', async (route) => {
    const res = await route.fetch();
    const isHtml = (res.headers()['content-type'] ?? '').includes('text/html');
    await route.fulfill({
      response: res,
      headers: isHtml ? { ...res.headers(), 'content-security-policy': policy } : res.headers(),
    });
  });
  await page.addInitScript(() => {
    const w = window as typeof window & { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      w.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI || 'inline'}`),
    );
  });
  for (const path of backboneRoutes()) {
    policy = cspFor(rules, path);
    await page.goto(path, { waitUntil: 'networkidle' });
    const violations = await page.evaluate(
      () => (window as typeof window & { __csp: string[] }).__csp,
    );
    expect(violations, `${path} must have no CSP violations`).toEqual([]);
  }
});

test('served HTML ships no style attributes (they would need unsafe-hashes)', async ({
  request,
}) => {
  for (const path of backboneRoutes()) {
    const html = await (await request.get(path)).text();
    expect(html.includes(' style="'), `${path} must not ship style="" attributes`).toBe(false);
  }
});

test('404.html carries the meta CSP that covers unmatched paths', async ({ request }) => {
  // No header rule can reach 404.html when it is served for an arbitrary
  // unmatched path, so the page itself must carry the policy.
  const html = await (await request.get('/404')).text();
  const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/);
  expect(meta, '404.html must embed a meta CSP').not.toBeNull();
  expect(meta![1]).not.toMatch(/unsafe-/);
  expect(meta![1]).toMatch(/style-src [^;]*'sha256-/);
  expect(meta![1]).toMatch(/script-src [^;]*'sha256-/);
  expect(meta![1], 'frame-ancestors is meta-invalid and must be stripped').not.toContain(
    'frame-ancestors',
  );
});
