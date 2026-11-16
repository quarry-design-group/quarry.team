import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Case-study images enlarge on request (ImageZoom): each eligible image becomes
 * a button that opens it in a native modal dialog, fitted to the screen, with an
 * actual-size mode and a link to the file. CASE has no raster to enlarge: its
 * hero is an inline SVG (vector, live text, never wrapped) and its architecture
 * diagram is an ArchitectureDiagram (inline SVG with its own Expand).
 * RASTER_HERO_CASE has a raster hero that enlarges from a wider derivative
 * than it renders, so the dialog itself is exercised there.
 */
const CASE = '/work/serving-a-aaa-game-reveal-with-100-uptime-on-aws';
/** A case whose raster hero renders narrower than its file. */
const RASTER_HERO_CASE =
  '/work/from-siloed-tools-to-a-single-source-of-truth-a-data-platform-and-self-serve-bi-for-a-pharmacy-group';

const triggers = (page: Page) => page.locator('.zoom-trigger');
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Enlarged image' });

test('inline SVG is never wrapped for zoom', async ({ page }) => {
  await page.goto(CASE);
  // The hero and the architecture diagram are both inline SVG with live text.
  await expect(triggers(page)).toHaveCount(0);
});

test('eligible images become enlarge buttons', async ({ page }) => {
  await page.goto(RASTER_HERO_CASE);
  await expect(triggers(page)).not.toHaveCount(0);
  for (const trigger of await triggers(page).all()) {
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(trigger).toContainText('Enlarge');
  }
});

test('a raster hero opens its wider derivative, not the one it renders', async ({ page }) => {
  await page.goto(RASTER_HERO_CASE);
  const hero = triggers(page).first().locator('img');
  const zoomSrc = (await hero.getAttribute('data-zoom-src')) as string;
  expect(zoomSrc).toMatch(/\.webp$/);

  await triggers(page).first().click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('img')).toHaveAttribute('src', zoomSrc);
  await expect(dialog(page).getByRole('link', { name: /Open file/ })).toHaveAttribute(
    'href',
    zoomSrc,
  );
});

test('Escape closes the dialog and focus returns to the image', async ({ page }) => {
  await page.goto(RASTER_HERO_CASE);
  const trigger = triggers(page).first();
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('img')).toHaveAttribute('alt', /^Pharmacy stockroom/);

  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('actual size shows the file at full width, panned by scrolling', async ({ page }) => {
  await page.goto(RASTER_HERO_CASE);
  await triggers(page).first().click();
  const toggle = dialog(page).getByRole('button', { name: 'Actual size' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await toggle.click();
  await expect(dialog(page).getByRole('button', { name: 'Fit to screen' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const stage = dialog(page).locator('[data-zoom-stage]');
  const overflows = await stage.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflows).toBe(true);

  await dialog(page).getByRole('button', { name: 'Close' }).click();
  await expect(dialog(page)).toBeHidden();
});

test('the open dialog has no axe violations', async ({ page }) => {
  await page.goto(RASTER_HERO_CASE);
  await triggers(page).first().click();
  await expect(dialog(page)).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include('[data-zoom-dialog]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

test('an inline hero.svg renders with live text and is not wrapped for zoom', async ({ page }) => {
  await page.goto(CASE);
  const chart = page.locator('.hero-chart-frame svg');
  await expect(chart).toHaveAttribute('role', 'img');
  await expect(chart.locator('title')).toHaveText(/^Dotted chart of real traffic/);
  await expect(chart.locator('text', { hasText: '70M+' })).toHaveCount(1);
  await expect(page.locator('.hero-chart-frame .zoom-trigger')).toHaveCount(0);
});
