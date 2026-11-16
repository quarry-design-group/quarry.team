import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Site search against the real Worker under wrangler dev (the `worker`
 * project — ADR-0021): the on-demand render with JavaScript off, the island
 * fetching the same route's fragment as the reader types, the header entry
 * point, the response headers (nonce CSP, no-store, noindex), and the
 * per-address budget the rate-limit binding enforces.
 */

/** The route keys its budget on `cf-connecting-ip`, which the edge always
 *  sets; wrangler dev sets nothing, so every test supplies its own address. */
const IP_HEADER = 'cf-connecting-ip';
const RUN_NET = `10.${Math.floor(Math.random() * 250)}`;
let addr = 10;
const nextIp = () => `${RUN_NET}.1.${addr++}`;

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ [IP_HEADER]: nextIp() });
});

const results = (page: Page) => page.locator('#search-results');

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// No injected style tag here: the page runs under the real, Worker-set CSP,
// which blocks it. The project's reducedMotion emulation already disables the
// site's animations for a deterministic scan.
const violationsOn = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return violations.map(
    (v) => `${v.id}: ${v.help} @ ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
};

test('with JavaScript off, submitting the form renders results on the same route', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    extraHTTPHeaders: { [IP_HEADER]: nextIp() },
  });
  const page = await context.newPage();
  await page.goto('/search');
  await expect(results(page)).toHaveAttribute('data-count', '0');
  const input = page.getByLabel('Search the site');
  await input.fill('shopify');
  // A plain GET submit: no page script exists in this context.
  await input.press('Enter');
  await page.waitForURL(/\/search\?q=shopify/);
  await expect(results(page)).toHaveAttribute('data-query', 'shopify');
  await expect(results(page)).toHaveAttribute('data-count', /^[1-9]\d*$/);
  await expect(results(page).locator('a[href^="/work/"]').first()).toBeVisible();
  await expect(results(page).locator('mark').first()).toHaveText(/shopify/i);
  await context.close();
});

test('with JavaScript on, results appear while typing and the address stays shareable', async ({
  page,
}) => {
  await page.goto('/search');
  const input = page.getByLabel('Search the site');
  await input.pressSequentially('shark', { delay: 40 });
  await expect(results(page)).toHaveAttribute('data-query', 'shark');
  await expect(page).toHaveURL(/\/search\?q=shark$/);
  await expect(results(page).locator('a[href^="/work/"]').first()).toBeVisible();
  await expect(page.locator('#search-live')).toHaveText(/results? for “shark”/);

  // Narrowing by kind refetches and keeps the kind in the address.
  await page.getByLabel('Limit results to').selectOption('post');
  await expect(page).toHaveURL(/\/search\?q=shark&kind=post$/);
  await expect(results(page)).toHaveAttribute('data-summary', /in insights$/);
});

test('the header links to the search page on desktop and in the mobile menu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Search' }).first().click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.locator('h1')).toHaveText(/find it on the site/i);
  await expect(page.locator('header a[href="/search"][aria-current="page"]')).toBeAttached();

  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto('/');
  await page.locator('.menu-toggle').click();
  await expect(page.locator('#mobile-nav a[href="/search"]')).toBeVisible();
});

test('the response carries the nonce CSP, no-store, and noindex, follow', async ({ request }) => {
  const res = await request.get('/search?q=data', { headers: { [IP_HEADER]: nextIp() } });
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/html');
  expect(res.headers()['cache-control']).toBe('no-store');
  const csp = res.headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(/script-src [^;]*'nonce-/);
  expect(csp).not.toMatch(/unsafe-/);
  const html = await res.text();
  expect(html).toContain('<meta name="robots" content="noindex, follow">');
  // The island is an external module; the only inline scripts are the layout's.
  expect(html).toMatch(/<script type="module" src="\/_astro\/[^"]+\.js"><\/script>/);
});

test('fragment mode answers with the results block alone, under the same headers', async ({
  request,
}) => {
  const res = await request.get('/search?q=data&fragment=1', {
    headers: { [IP_HEADER]: nextIp() },
  });
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/html');
  expect(res.headers()['cache-control']).toBe('no-store');
  expect(res.headers()['content-security-policy']).toMatch(/nonce-/);
  const body = await res.text();
  expect(body.startsWith('<div id="search-results"')).toBe(true);
  expect(body).not.toContain('<html');
  expect(body).not.toContain('<script');
  expect(body).toMatch(/data-count="[1-9]\d*"/);
});

test('over the budget, both modes answer 429 with Retry-After', async ({ request }) => {
  const headers = { [IP_HEADER]: nextIp() };
  let last = await request.get('/search?q=data&fragment=1', { headers });
  for (let i = 0; i < 70 && last.status() !== 429; i++) {
    last = await request.get('/search?q=data&fragment=1', { headers });
  }
  expect(last.status()).toBe(429);
  expect(last.headers()['retry-after']).toBe('60');
  const fragment = await last.text();
  expect(fragment.startsWith('<div id="search-results"')).toBe(true);
  expect(fragment).toContain('data-status="rate-limited"');

  const page = await request.get('/search?q=data', { headers });
  expect(page.status()).toBe(429);
  expect(page.headers()['retry-after']).toBe('60');
  expect(await page.text()).toContain('Too many searches');

  // The prompt state costs nothing: the empty page still renders for the
  // same address.
  const prompt = await request.get('/search', { headers });
  expect(prompt.status()).toBe(200);
});

test('axe: the search page meets WCAG 2.2 AA with results, with none, and empty', async ({
  page,
}) => {
  for (const path of ['/search', '/search?q=data', '/search?q=zqxjvkwp']) {
    await page.goto(path);
    expect(await violationsOn(page), path).toEqual([]);
  }
});
