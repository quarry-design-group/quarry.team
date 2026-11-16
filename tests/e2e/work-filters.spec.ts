import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The case library's discipline views (/work/discipline/<d>): each lists
 * exactly the published cases carrying that discipline, the filter bar marks
 * the current view, /work lists everything, and the discipline tags on a
 * case lead to its view. Expectations come from the content on disk, so a
 * new case is under the contract the moment it is committed.
 */

const CASES_DIR = fileURLToPath(new URL('../../apps/web/src/content/cases', import.meta.url));
const DISCIPLINES = ['strategy', 'design', 'engineering', 'ecommerce', 'data'] as const;

type CaseFacts = { slug: string; disciplines: string[] };

/** Published cases (not draft, not comingSoon) with their disciplines. */
const publishedCases = (): CaseFacts[] =>
  readdirSync(CASES_DIR)
    .filter((slug) => existsSync(join(CASES_DIR, slug, 'index.mdx')))
    .map((slug) => {
      const fm =
        readFileSync(join(CASES_DIR, slug, 'index.mdx'), 'utf8').match(
          /^---\r?\n([\s\S]*?)\r?\n---/,
        )?.[1] ?? '';
      const list = fm.match(/^disciplines:\s*\[([^\]]*)\]/m)?.[1] ?? '';
      return {
        slug,
        disciplines: [...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1] ?? ''),
        published: !/^draft:\s*true/m.test(fm) && !/^comingSoon:\s*true/m.test(fm),
      };
    })
    .filter((c) => c.published);

const FILTER_NAV = 'nav[aria-label="Filter work by discipline"]';

/** Slugs of the cards in the grid, in page order. */
const cardSlugs = async (page: Page) =>
  (
    await page
      .locator('main a.card[href^="/work/"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''))
  ).map((href) => href.replace('/work/', ''));

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('/work lists every published case and marks "All work" as current', async ({ page }) => {
  await page.goto('/work');
  const expected = publishedCases().map((c) => c.slug);
  const listed = await cardSlugs(page);
  expect([...listed].sort()).toEqual([...expected].sort());
  await expect(page.locator(`${FILTER_NAV} a[aria-current="page"]`)).toHaveAttribute(
    'href',
    '/work',
  );
  await expect(page.getByText(`${expected.length} case studies`, { exact: false })).toBeVisible();
});

for (const discipline of DISCIPLINES) {
  test(`/work/discipline/${discipline} lists only the cases in that discipline`, async ({
    page,
  }) => {
    const expected = publishedCases()
      .filter((c) => c.disciplines.includes(discipline))
      .map((c) => c.slug);
    const res = await page.goto(`/work/discipline/${discipline}`);
    if (expected.length === 0) {
      expect(res?.status(), 'a discipline without cases has no view').toBe(404);
      return;
    }
    expect(res?.status()).toBe(200);
    const listed = await cardSlugs(page);
    expect([...listed].sort()).toEqual([...expected].sort());

    const current = page.locator(`${FILTER_NAV} a[aria-current="page"]`);
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute('href', `/work/discipline/${discipline}`);
    await expect(page.locator('h1')).toBeVisible();
    await expect(
      page.getByText(new RegExp(`^${expected.length} case stud(y|ies) in `)),
    ).toBeVisible();

    const canonical = await page.locator('head link[rel="canonical"]').getAttribute('href');
    expect(new URL(canonical ?? '').pathname).toBe(`/work/discipline/${discipline}`);
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(ld.some((block) => JSON.parse(block)['@type'] === 'CollectionPage')).toBe(true);
  });
}

test('the discipline views follow the same order as /work', async ({ page }) => {
  await page.goto('/work');
  const all = await cardSlugs(page);
  await page.goto('/work/discipline/engineering');
  const view = await cardSlugs(page);
  expect(view).toEqual(all.filter((slug) => view.includes(slug)));
});

test('a case study links each discipline tag to its view', async ({ page }) => {
  const first = publishedCases().find((c) => c.disciplines.length > 0);
  if (!first) throw new Error('no published case carries a discipline');
  await page.goto(`/work/${first.slug}`);
  for (const d of first.disciplines) {
    await expect(page.locator(`main a[href="/work/discipline/${d}"]`).first()).toBeVisible();
  }
});

test('the discipline views are in the sitemap', async ({ request }) => {
  const index = await (await request.get('/sitemap-index.xml')).text();
  const sitemaps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? '');
  const urls = new Set<string>();
  for (const url of sitemaps) {
    const body = await (await request.get(new URL(url).pathname)).text();
    for (const m of body.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.add(new URL(m[1] ?? '').pathname);
  }
  for (const d of DISCIPLINES) {
    if (publishedCases().some((c) => c.disciplines.includes(d))) {
      expect(urls.has(`/work/discipline/${d}`), `/work/discipline/${d} in the sitemap`).toBe(true);
    }
  }
  expect(urls.has('/search'), '/search stays out of the sitemap').toBe(false);
});

test('axe: a discipline view meets WCAG 2.2 AA', async ({ page }) => {
  await page.goto('/work/discipline/data');
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  });
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
