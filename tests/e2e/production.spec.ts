import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { backboneRoutes } from './routes';

/**
 * Post-deploy smoke against the LIVE site (ADR-0018). Runs only when
 * SMOKE_BASE_URL is set (playwright.config.ts swaps in the `production`
 * project and drops the local web server); the deploy workflow runs it right
 * after `wrangler deploy` and rolls the Worker back if it fails.
 *
 * Scope is deliberately narrow — the things a bad dependency bump breaks at
 * the edge that the pre-merge suite (served by sirv) cannot see: routing,
 * headers, the on-demand routes and the Worker secrets they need, the CSP
 * nonce Cloudflare's edge-injected script must run under, and a
 * machine-checkable a11y pass.
 *
 * Every probe goes through the browser (page navigations and an in-page
 * fetch), never Playwright's Node request context. Cloudflare's bot mitigation
 * answers non-browser clients from datacenter IPs with a 403 block page while
 * real browser traffic from the same runner passes, and a visitor-shaped probe
 * is what this smoke is meant to be.
 */

const CRAWL_SURFACE = ['/sitemap-index.xml', '/robots.txt', '/llms.txt', '/service-worker.js'];

test('home renders the hero and primary CTA', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1')).toContainText(/digital products/i);
  await expect(page.getByRole('link', { name: 'Start a project' }).first()).toBeVisible();
  await expect(page).toHaveTitle(/Quarry/);
});

// One test — one fresh browser context — per backbone route. Bot Fight Mode's
// JavaScript Detections runs on every page now that the CSP nonce lets it
// (ADR-0019), and it classifies this headless browser as what it is: after the
// first page in a session it challenges the next navigation with a 403
// interstitial. A first visit passes, so each route is probed as one. The
// Free plan cannot exempt the smoke (Bot Fight Mode ignores WAF skip rules);
// a Super Bot Fight Mode skip rule keyed on a smoke header is the proper
// exemption if Cloudflare ever correlates the verdict by IP.
for (const path of backboneRoutes()) {
  test(`backbone route ${path} is served`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status(), `${path} should 200`).toBe(200);
    await expect(page.locator('h1').first(), `${path} should carry an h1`).toBeVisible();
  });
}

test('crawl surface resolves', async ({ page }) => {
  for (const path of CRAWL_SURFACE) {
    const res = await page.goto(path);
    expect(res?.status(), `${path} should 200`).toBe(200);
  }
});

test('the service-worker kill-switch is never cached', async ({ page }) => {
  // The legacy SW unregisters itself, so every update check has to reach the
  // live file. `apps/web/public/_headers` is what delivers that: it is the
  // site's only cache plane, since zone cache rules do not apply to Worker
  // responses. This pins the header a visitor actually receives, on the only
  // surface that serves it through the real asset layer — the pre-merge suite
  // is served by sirv, which does not honour _headers.
  const res = await page.goto('/service-worker.js');
  expect(res?.status(), '/service-worker.js should 200').toBe(200);
  expect(res?.headers()['cache-control'], '/service-worker.js cache-control').toBe('no-store');
});

test('edge headers: strict CSP with no unsafe- source expressions', async ({ page }) => {
  const res = await page.goto('/');
  const csp = res?.headers()['content-security-policy'] ?? '';
  expect(csp, 'CSP header present').not.toBe('');
  expect(csp).toMatch(/script-src[^;]*'sha256-/);
  expect(csp).not.toMatch(/'unsafe-/);
  expect(csp, 'per-request nonce in script-src (ADR-0019)').toMatch(
    /script-src[^;]*'nonce-[A-Za-z0-9+/]{22}=='/,
  );
});

test('the script Cloudflare injects at the edge runs under the CSP nonce', async ({ page }) => {
  // Bot Fight Mode injects a bot-detection bootstrap into HTML responses whose
  // body carries the ray id, so it can only run under a per-request nonce the
  // edge reads from our header (ADR-0019). When the bootstrap is present it
  // must carry our nonce, and the page must raise no script-src violation.
  await page.addInitScript(() => {
    const w = window as typeof window & { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      w.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI || 'inline'}`),
    );
  });
  const res = await page.goto('/', { waitUntil: 'networkidle' });
  const nonce = res?.headers()['content-security-policy']?.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce, 'the header carries a nonce').toBeTruthy();
  const injected = await page.evaluate(() =>
    [...document.scripts]
      .filter((s) => !s.src && s.textContent.includes('/cdn-cgi/challenge-platform/'))
      .map((s) => s.nonce),
  );
  for (const stamped of injected) {
    expect(stamped, 'the injected bootstrap carries our nonce').toBe(nonce);
  }
  const violations = await page.evaluate(
    () => (window as typeof window & { __csp: string[] }).__csp,
  );
  expect(
    violations.filter((v) => v.startsWith('script-src')),
    'no script-src violation on the live page',
  ).toEqual([]);
});

test('on-demand grievance page renders (its signing key is present)', async ({ page }) => {
  // The Worker serves the grievance form as a 503 when WORKER_GRIEVANCE_SIGNING_KEY
  // is missing, so a deploy whose environment lacks it fails here and rolls back.
  const res = await page.goto('/policies/grievances');
  expect(res?.status()).toBe(200);
  expect(res?.headers()['cache-control']).toBe('no-store');
  await expect(page.locator('input[type="hidden"][name="_t"]')).toHaveCount(1);
});

test('on-demand API route is alive (rejects, does not error)', async ({ page }) => {
  // A bare POST must be refused by the route's own validation — a JSON
  // `{ ok: false }` with a 4xx — never by a 5xx, and never by an edge block
  // page (which is HTML). That is the signal the Worker runtime, bindings,
  // and adapter are intact; a 503 means the Worker lacks WORKER_TURNSTILE_SECRET
  // (the form endpoints fail closed). The JSON carries the site's security
  // headers and is never cached.
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const r = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    return {
      status: r.status,
      body: await r.text(),
      nosniff: r.headers.get('x-content-type-options'),
      cacheControl: r.headers.get('cache-control'),
    };
  });
  expect(result.status).toBeGreaterThanOrEqual(400);
  expect(result.status).toBeLessThan(500);
  expect(() => JSON.parse(result.body), 'route answered JSON').not.toThrow();
  expect(JSON.parse(result.body)).toMatchObject({ ok: false });
  expect(result.nosniff).toBe('nosniff');
  expect(result.cacheControl).toBe('no-store');
});

test('home passes axe (WCAG 2.2 AA)', async ({ page }) => {
  // The live CSP forbids injected inline styles, so the entrance animations
  // are settled the way a visitor would settle them: the site disables them
  // under prefers-reduced-motion (global.css).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.help}`),
    'axe violations on the live home page',
  ).toEqual([]);
});
