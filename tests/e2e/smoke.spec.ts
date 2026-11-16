import { test, expect } from '@playwright/test';
import { backboneRoutes } from './routes';

test('home renders hero, nav, and primary CTA', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText(/digital products/i);
  await expect(page.getByRole('link', { name: 'Start a project' }).first()).toBeVisible();
  await expect(page).toHaveTitle(/Quarry/);
});

test('every backbone route renders (derived from src/pages)', async ({ page }) => {
  for (const path of backboneRoutes().filter((p) => p !== '/')) {
    const res = await page.goto(path);
    expect(res?.status(), `${path} responds with an error status`).toBeLessThan(400);
    await expect(page.locator('h1')).toBeVisible();
  }
});

test('skip link is the first focusable element', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveText(/skip to content/i);
});

test('service-worker kill-switch stays deployed (legacy-SW exorcism)', async ({ request }) => {
  // apps/web/public/service-worker.js is intentionally "dead" code: nothing on
  // this site registers a worker, but browsers still haunted by the legacy
  // WordPress SW (registered at this exact path) fetch it on their next update
  // check and are cured by it. Deleting it would resurrect the old site from
  // visitors' CacheStorage. It must ship, at this path, indefinitely.
  const res = await request.get('/service-worker.js');
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain('skipWaiting');
  expect(body).toContain('unregister');
});

test('browser console carries the recruitment signature', async ({ page }) => {
  const messages: string[] = [];
  page.on('console', (m) => messages.push(m.text()));
  await page.goto('/');
  await page.waitForTimeout(300);
  expect(messages.join('\n')).toMatch(/built to be inspected/i);
});

test('global stylesheet is applied (regression: unstyled build)', async ({ page }) => {
  await page.goto('/');
  // Body text font comes only from the global CSS bundle.
  const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(bodyFont.toLowerCase()).toContain('hanken');
  // Headings use the display serif (global h1..h4 rule) — proves the bundle, not
  // just inline scoped styles, is being served and applied.
  const h1Font = await page
    .locator('h1')
    .first()
    .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(h1Font.toLowerCase()).toContain('fraunces');
});

test('header brand logo is visible (regression: white-on-white / 0×0)', async ({ page }) => {
  await page.goto('/');
  const box = await page.locator('header a[aria-label*="Quarry"] svg').first().boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(40);
  expect(box?.height ?? 0).toBeGreaterThan(10);
});

test('header bar holds one line through the squeeze band (no wrap/overflow)', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'desktop-only layout check; mobile gets the hamburger');
  // 921 = first desktop width, 1000/1080 = squeeze band, 1280 = comfortable.
  for (const width of [921, 1000, 1080, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    // The bar's height is the --header-height token; one extra pixel absorbs
    // subpixel rounding.
    const headerHeight = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')),
    );
    expect(headerHeight, '--header-height is unset').toBeGreaterThan(0);
    const bar = await page.locator('.site-header .bar').boundingBox();
    expect(bar?.height, `header bar wraps at ${width}px`).toBeLessThanOrEqual(headerHeight + 1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
    await expect(page.getByRole('link', { name: 'Start a project' }).first()).toBeVisible();
  }
});

test('AI nav group discloses its pages (desktop dropdown / mobile section)', async ({ page }) => {
  await page.goto('/');
  const menu = page.locator('.menu-toggle');
  if (await menu.isVisible()) {
    // Mobile: the group renders as a labeled section inside the menu.
    await menu.click();
    await expect(page.locator('#mobile-nav a[href="/ai-services"]')).toBeVisible();
    await expect(page.locator('#mobile-nav a[href="/how-we-use-ai"]')).toBeVisible();
  } else {
    // Desktop: APG disclosure — click opens, Escape closes and restores focus.
    const btn = page.locator('.nav .sub-btn');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.nav .sub a[href="/ai-services"]')).toBeHidden();
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.nav .sub a[href="/ai-services"]')).toBeVisible();
    await expect(page.locator('.nav .sub a[href="/how-we-use-ai"]')).toBeVisible();

    // Layout regressions (prod hotfix): the panel must stack its links
    // vertically, and the trigger's text must share the links' baseline.
    const first = await page.locator('.nav .sub a[href="/ai-services"]').boundingBox();
    const second = await page.locator('.nav .sub a[href="/how-we-use-ai"]').boundingBox();
    expect(first && second && second.x === first.x, 'panel links not left-aligned').toBe(true);
    expect(
      first && second && second.y >= first.y + first.height,
      'panel links not stacked vertically',
    ).toBe(true);
    const baselineDelta = await page.evaluate(() => {
      // Compare rendered text rects (a Range ignores box padding, so this
      // measures the glyphs themselves — what the eye lines up).
      const textRect = (el: Element) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getBoundingClientRect();
      };
      const link = document.querySelector('.nav > ul > li > a');
      const trigger = document.querySelector('.nav .sub-btn');
      if (!link || !trigger) return Number.NaN;
      return Math.abs(textRect(link).bottom - textRect(trigger).bottom);
    });
    expect(baselineDelta, 'group trigger text misaligned with nav links').toBeLessThanOrEqual(2);

    await page.keyboard.press('Escape');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn).toBeFocused();
  }
});

test('mobile menu scrolls within a landscape phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('/');
  await page.locator('.menu-toggle').click();
  const panel = page.locator('#mobile-nav');
  await expect(panel).toBeVisible();

  // The page behind the open menu is scroll-locked, so the panel itself must
  // fit the viewport and scroll.
  const box = await panel.boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 0), 'menu overflows the viewport').toBeLessThanOrEqual(
    376,
  );
  await panel.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));

  await expect(panel.locator('nav a[href="/careers"]')).toBeInViewport();
  await expect(panel.getByRole('link', { name: 'Start a project' })).toBeInViewport();
});

test('theme toggle switches color mode', async ({ page }) => {
  await page.goto('/');
  // On narrow viewports the toggle lives inside the mobile menu.
  const menu = page.locator('.menu-toggle');
  if (await menu.isVisible()) await menu.click();
  await page.locator('.theme-toggle:visible').first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', /^(light|dark)$/);
});

test('both theme toggles track the document theme', async ({ page }) => {
  await page.goto('/');
  const menu = page.locator('.menu-toggle');
  if (await menu.isVisible()) await menu.click();
  const toggles = page.locator('.theme-toggle');
  await expect(toggles).toHaveCount(2);

  await page.locator('.theme-toggle:visible').first().click();
  const pressed = (await page.locator('html').getAttribute('data-theme')) === 'dark';
  for (const toggle of await toggles.all()) {
    await expect(toggle).toHaveAttribute('aria-pressed', String(pressed));
  }
});

test('client logo wall renders real logos (not text)', async ({ page }) => {
  await page.goto('/');
  const logos = page.locator('.logowall img');
  expect(await logos.count()).toBeGreaterThanOrEqual(6);
});

test.describe('under reduced motion', () => {
  // Globe.astro redraws its WebGL globe every frame at 2x the canvas's CSS
  // size. Under headless CI's software GL, each desktop frame holds the main
  // thread (~12s for this test on the chromium project). Under reduced motion
  // the globe draws once and parks, which is also the contract asserted below.
  test.use({ reducedMotion: 'reduce' });

  test('team page shows the full roster and a still, initialized globe', async ({ page }) => {
    await page.goto('/team');
    expect(await page.locator('.people .person').count()).toBeGreaterThanOrEqual(12);

    // Initialized, not just present: one pin per marker, and cobe has sized
    // the drawing buffer to 2x the CSS width (BUFFER_DPR), which happens only
    // once createGlobe has run.
    const canvas = page.locator('canvas.globe__canvas');
    const markers = JSON.parse((await canvas.getAttribute('data-markers')) ?? '[]') as unknown[];
    expect(markers.length, 'globe has no markers').toBeGreaterThan(0);
    const pins = page.locator('.globe__pins .globe__pin');
    await expect(pins).toHaveCount(markers.length);
    const buffer = await canvas.evaluate((c: HTMLCanvasElement) => ({
      width: c.width,
      css: c.offsetWidth,
    }));
    expect(buffer.width, 'globe drawing buffer was never sized').toBe(buffer.css * 2);

    // Reduced motion holds it still: no pin moves between two reads.
    const transforms = () =>
      pins.evaluateAll((els) => els.map((el) => (el as HTMLElement).style.transform));
    const before = await transforms();
    expect(before.every(Boolean), 'globe pins were never placed').toBe(true);
    await page.waitForTimeout(500);
    expect(await transforms(), 'globe rotated under reduced motion').toEqual(before);
  });
});

test('testimonials show multiple quotes with reviewer photos', async ({ page }) => {
  await page.goto('/');
  const cards = page.locator('.testimonials .card');
  expect(await cards.count()).toBeGreaterThanOrEqual(4);
  await expect(page.locator('.testimonials .avatar').first()).toBeVisible();
});
