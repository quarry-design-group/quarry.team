import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Motion images are reader-started (WCAG 2.2.2 Pause, Stop, Hide, Level A —
 * ADR 0012): a post carrying animated WebP renders each clip's still with a
 * play control, fetches the animation only on request, and the same control
 * returns to the still. The post below is the site's densest motion page.
 */
const POST = '/blog/three-ecommerce-technology-trends-watch-2018';
const CLIPS = 4;

const firstFigure = (page: Page) => page.locator('figure[data-motion]').first();

test('every clip starts as its still, with a play control', async ({ page }) => {
  await page.goto(POST);
  const figures = page.locator('figure[data-motion]');
  await expect(figures).toHaveCount(CLIPS);
  for (const figure of await figures.all()) {
    await expect(figure.locator('img')).toHaveAttribute('src', /\.poster\./);
    await expect(figure.getByRole('button', { name: 'Play animation' })).toBeVisible();
  }
});

test('the control plays the clip on request and stops it again', async ({ page }) => {
  await page.goto(POST);
  const figure = firstFigure(page);
  const img = figure.locator('img');
  const still = (await img.getAttribute('src')) as string;
  await expect(img).toHaveAttribute('srcset', /\S/);

  await figure.getByRole('button', { name: 'Play animation' }).click();
  await expect(figure.getByRole('button', { name: 'Pause animation' })).toBeVisible();
  await expect(img).not.toHaveAttribute('src', still);
  await expect(img).not.toHaveAttribute('src', /\.poster\./);
  await expect(img).not.toHaveAttribute('srcset', /\S/);

  await figure.getByRole('button', { name: 'Pause animation' }).click();
  await expect(figure.getByRole('button', { name: 'Play animation' })).toBeVisible();
  await expect(img).toHaveAttribute('src', still);
  await expect(img).toHaveAttribute('srcset', /\S/);
});

test('no clip is fetched until it is asked for', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));

  await page.goto(POST);
  const clips = await page
    .locator('[data-motion-toggle]')
    .evaluateAll((buttons) => buttons.map((b) => (b as HTMLElement).dataset.clip as string));
  expect(clips).toHaveLength(CLIPS);
  // 4.4 MiB across the four derivatives — the point of the component is that the
  // page load does not carry them.
  expect(requested.filter((url) => clips.some((clip) => url.endsWith(clip)))).toEqual([]);

  const figure = firstFigure(page);
  await figure.getByRole('button', { name: 'Play animation' }).click();
  await expect(figure.getByRole('button', { name: 'Pause animation' })).toBeVisible();
  expect(requested.some((url) => url.endsWith(clips[0]!))).toBe(true);
});

test('the control reports loading, not playing, until the clip arrives', async ({ page }) => {
  await page.goto(POST);
  const figure = firstFigure(page);
  const clip = (await figure.locator('[data-motion-toggle]').getAttribute('data-clip')) as string;

  // The heaviest clips are ~650 KB: hold one back so the in-flight state is
  // observable, as it is on a slow connection.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**${clip}`, async (route) => {
    await held;
    await route.continue();
  });

  await figure.getByRole('button', { name: 'Play animation' }).click();
  await expect(figure.getByRole('button', { name: 'Loading animation' })).toHaveAttribute(
    'aria-busy',
    'true',
  );
  release();
  await expect(figure.getByRole('button', { name: 'Pause animation' })).toBeVisible();
});

test('the derivative the control fetches is still animated', async ({ page }) => {
  await page.goto(POST);
  const clip = await firstFigure(page).locator('[data-motion-toggle]').getAttribute('data-clip');
  const response = await page.request.get(new URL(clip as string, page.url()).href);
  expect(response.ok()).toBe(true);

  // A de-animated derivative (a pipeline or sharp change that drops frames past
  // the first) would leave every other test green while the "animation" ships as
  // a still. ANMF is the animation-frame chunk of the WebP RIFF container.
  const body = await response.body();
  expect(body.subarray(0, 4).toString('latin1')).toBe('RIFF');
  expect(body.toString('latin1').split('ANMF').length - 1).toBeGreaterThan(1);
});

test.describe('under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the still stands and the control stays available', async ({ page }) => {
    await page.goto(POST);
    const figure = firstFigure(page);
    await expect(figure.locator('img')).toHaveAttribute('src', /\.poster\./);
    await expect(figure.getByRole('button', { name: 'Play animation' })).toBeVisible();
  });
});

/**
 * The tools band's backdrop drifts indefinitely, so it carries the same
 * pause control as the logo wall (WCAG 2.2.2): checking it pauses every
 * marquee track in that band and only that band.
 */
test('the tools band pauses its drift from its own control', async ({ page }) => {
  await page.goto('/services');
  const bands = page.locator('.tools-band');
  await expect(bands).toHaveCount(2);
  const [first, second] = [bands.nth(0), bands.nth(1)];
  const playStates = (band: typeof first) =>
    band
      .locator('.tbg-track')
      .evaluateAll((tracks) => tracks.map((t) => getComputedStyle(t).animationPlayState));

  expect(new Set(await playStates(first))).toEqual(new Set(['running']));

  const control = first.getByRole('checkbox', { name: 'Pause tools animation' });
  // Each band's control carries its heading, so the two names differ.
  const names = await page
    .getByRole('checkbox', { name: 'Pause tools animation' })
    .evaluateAll((els) => els.map((el) => el.parentElement?.textContent?.trim()));
  expect(new Set(names).size, 'pause controls share one accessible name').toBe(names.length);
  await control.scrollIntoViewIfNeeded();
  await control.check();
  expect(new Set(await playStates(first))).toEqual(new Set(['paused']));
  expect(new Set(await playStates(second))).toEqual(new Set(['running']));

  await control.uncheck();
  expect(new Set(await playStates(first))).toEqual(new Set(['running']));
});

test('axe: the figure is conformant still and playing', async ({ page }) => {
  await page.goto(POST);
  // Settle the page's entrance animations so axe samples final colors (a11y.spec).
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  });
  const scan = async () =>
    (await new AxeBuilder({ page }).include('figure[data-motion]').analyze()).violations;
  expect(await scan()).toEqual([]);
  await firstFigure(page).getByRole('button', { name: 'Play animation' }).click();
  await expect(firstFigure(page).getByRole('button', { name: 'Pause animation' })).toBeVisible();
  expect(await scan()).toEqual([]);
});
