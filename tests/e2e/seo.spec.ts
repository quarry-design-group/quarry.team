import { test, expect, type Page } from '@playwright/test';
import { backboneRoutes } from './routes';

/**
 * Technical-SEO contract for every indexable page type: titles, descriptions,
 * canonicals, social cards, and structured data. One goto per URL, no
 * screenshots — designed to stay fast.
 *
 * Run under reduced motion. On the Desktop Chrome project, /team's WebGL globe
 * (Globe.astro) redraws every frame at 2x its large desktop canvas, and with
 * headless CI's software GL each frame holds the main thread. Every Playwright
 * call on that page queued behind it (~18s on /team alone), pushing this walk
 * past the 30s test timeout. Under reduced motion the globe draws once and
 * parks. None of this contract depends on motion.
 */
test.use({ reducedMotion: 'reduce' });

const PAGES = [
  // Every level-1 page, derived from src/pages (routes.ts) — a new backbone
  // page is held to this contract automatically, never added by hand.
  ...backboneRoutes(),
  // One representative of each content template.
  '/work/growing-a-travel-membership-from-6k-to-250k-members',
  '/blog/quarrys-vision-and-values',
  '/policies/privacy',
];

const JSONLD_PAGES = [
  '/',
  '/work/growing-a-travel-membership-from-6k-to-250k-members',
  '/blog/quarrys-vision-and-values',
  '/careers/product-data-scientist',
];

const meta = (page: Page, selector: string) =>
  page.locator(`head meta[${selector}]`).getAttribute('content');

test('titles, descriptions, canonicals, and social cards hold the SEO contract', async ({
  page,
}) => {
  const titles = new Map<string, string>();

  for (const path of PAGES) {
    const res = await page.goto(path);
    expect(res?.status(), `${path} should 200`).toBe(200);

    // Title: present, unique across the site, and within the ~600px SERP budget.
    const title = await page.title();
    expect(title.length, `${path} title is empty`).toBeGreaterThan(0);
    expect(title.length, `${path} title too long: "${title}"`).toBeLessThanOrEqual(60);
    for (const [otherPath, otherTitle] of titles) {
      expect(title, `${path} duplicates the title of ${otherPath}`).not.toBe(otherTitle);
    }
    titles.set(path, title);

    // Meta description: present and inside the 70–160 char window.
    // (/contact ships PO-approved verbatim copy that lands at exactly 161.)
    const maxDescription = path === '/contact' ? 161 : 160;
    const description = await meta(page, 'name="description"');
    expect(description, `${path} missing meta description`).toBeTruthy();
    expect(description!.length, `${path} description too short`).toBeGreaterThanOrEqual(70);
    expect(description!.length, `${path} description too long`).toBeLessThanOrEqual(maxDescription);

    // Canonical: absolute, slash-less, and pointing at this page.
    const canonical = await page.locator('head link[rel="canonical"]').getAttribute('href');
    expect(canonical, `${path} missing canonical`).toBeTruthy();
    expect(canonical, `${path} canonical not absolute`).toMatch(/^https?:\/\//);
    if (path !== '/') {
      expect(canonical!.endsWith('/'), `${path} canonical has a trailing slash`).toBe(false);
    }
    expect(new URL(canonical!).pathname, `${path} canonical points elsewhere`).toBe(
      path === '/' ? '/' : path,
    );

    // Social cards.
    expect(await meta(page, 'property="og:title"'), `${path} missing og:title`).toBeTruthy();
    expect(await meta(page, 'property="og:image"'), `${path} missing og:image`).toBeTruthy();
    expect(await meta(page, 'name="twitter:card"'), `${path} missing twitter:card`).toBeTruthy();

    // Articles (posts) declare themselves as such.
    if (path.startsWith('/blog/')) {
      expect(await meta(page, 'property="og:type"'), `${path} og:type`).toBe('article');
    }
  }
});

test('JSON-LD on key templates parses as valid JSON', async ({ page }) => {
  for (const path of JSONLD_PAGES) {
    const res = await page.goto(path);
    expect(res?.status(), `${path} should 200`).toBe(200);

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(blocks.length, `${path} has no JSON-LD`).toBeGreaterThan(0);
    for (const block of blocks) {
      const parsed = JSON.parse(block); // throws → test fails on invalid JSON
      expect(parsed, `${path} JSON-LD lacks @context`).toHaveProperty('@context');
    }
  }
});

test('each open role’s JobPosting names the countries it hires from', async ({ page }) => {
  // Google requires at least one country for a TELECOMMUTE posting.
  await page.goto('/careers');
  const roles = await page
    .locator('main a[href^="/careers/"]')
    .evaluateAll((links) => [...new Set(links.map((a) => a.getAttribute('href') as string))]);
  expect(roles.length, '/careers lists no open roles').toBeGreaterThan(0);

  for (const path of roles) {
    await page.goto(path);
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const job = blocks.map((b) => JSON.parse(b)).find((ld) => ld['@type'] === 'JobPosting');
    expect(job, `${path} has no JobPosting`).toBeTruthy();
    expect(job.jobLocationType, `${path} jobLocationType`).toBe('TELECOMMUTE');
    expect(
      job.applicantLocationRequirements?.length,
      `${path} JobPosting has no applicantLocationRequirements`,
    ).toBeGreaterThan(0);
    for (const req of job.applicantLocationRequirements) {
      expect(req, `${path} location requirement`).toMatchObject({ '@type': 'Country' });
      expect(req.name, `${path} country code`).toMatch(/^[A-Z]{2}$/);
    }
  }
});
