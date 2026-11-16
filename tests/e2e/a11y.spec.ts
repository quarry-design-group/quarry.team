import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { backboneRoutes } from './routes';

/**
 * Automated WCAG 2.2 AA assertions (axe-core) on every backbone route plus a
 * representative detail page per dynamic template in the light palette, with
 * the dark palette sampled on `/`, `/work` and `/contact`. Axe catches the
 * machine-checkable subset of WCAG; manual audits cover the rest (ADR 0012).
 */

/* The site disables its entrance animations under prefers-reduced-motion
 * (global.css). Scanning in that mode keeps axe deterministic — otherwise it
 * can sample text mid-fade and report the blended color as a contrast
 * violation — and asserts the reduced-motion experience stays conformant. */
test.use({ reducedMotion: 'reduce' });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const violationsOn = async (page: Page) => {
  // Belt to the reduced-motion suspenders: the emulation can land a beat
  // after first paint, letting axe sample entrance animations mid-fade and
  // report blended colors as contrast violations. Snapping animation/
  // transition off resolves every element to its settled state (the
  // choreography uses from-only keyframes, so base styles ARE the final
  // state) and makes the scan fully deterministic.
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  });
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return violations;
};

/** Readable assertion message: one line per violation, with offending targets. */
const describeViolations = (violations: Awaited<ReturnType<typeof violationsOn>>) =>
  violations
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n` +
        v.nodes.map((n) => `    ${n.target.join(' ')}`).join('\n'),
    )
    .join('\n');

for (const path of backboneRoutes()) {
  test(`axe: ${path} meets WCAG 2.2 AA`, async ({ page }) => {
    await page.goto(path);
    const violations = await violationsOn(page);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
}

/** Detail templates are dynamic routes — resolve a real slug from the index. */
const firstDetailHref = async (page: Page, indexPath: string, prefix: string) => {
  await page.goto(indexPath);
  const href = await page.locator(`a[href^="${prefix}"]:not([href="${prefix}"])`).first();
  return (await href.getAttribute('href')) ?? test.fail();
};

test('axe: a case-study detail page meets WCAG 2.2 AA', async ({ page }) => {
  const href = await firstDetailHref(page, '/work', '/work/');
  await page.goto(href as string);
  const violations = await violationsOn(page);
  expect(violations, describeViolations(violations)).toEqual([]);
});

test('axe: a blog post meets WCAG 2.2 AA', async ({ page }) => {
  const href = await firstDetailHref(page, '/blog', '/blog/');
  await page.goto(href as string);
  const violations = await violationsOn(page);
  expect(violations, describeViolations(violations)).toEqual([]);
});

test('axe: a static policy page meets WCAG 2.2 AA', async ({ page }) => {
  await page.goto('/policies/privacy');
  const violations = await violationsOn(page);
  expect(violations, describeViolations(violations)).toEqual([]);
});

test('axe: a position detail page meets WCAG 2.2 AA', async ({ page }) => {
  const href = await firstDetailHref(page, '/careers', '/careers/');
  await page.goto(href as string);
  const violations = await violationsOn(page);
  expect(violations, describeViolations(violations)).toEqual([]);
});

/** Contrast obligations differ per theme; scan the dark palette too. */
for (const path of ['/', '/work', '/contact']) {
  test(`axe: ${path} meets WCAG 2.2 AA in dark mode`, async ({ page }) => {
    await page.goto(path);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const violations = await violationsOn(page);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
}
